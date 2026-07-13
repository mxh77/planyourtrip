/**
 * DevHub Orchestrator — coordonne automatiquement le pipeline issue → PR → review → preview → QA → merge → deploy
 *
 * Garde-fous anti-boucle :
 *   1. retryCount     — max 3 cycles fix/review par PR
 *   2. totalTransitions — max 50 transitions sur toute la vie de l'issue
 *   3. lockedUntil    — verrou temporaire pendant qu'un agent tourne
 *   4. cooldown       — délai minimum entre deux déclenchements de la même étape
 *   5. transitions autorisées uniquement "en avant" (state machine stricte)
 *   6. déduplication  — pas de déclenchement si un run GitHub est déjà en cours
 */

const https = require('https');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Mutex en mémoire : évite que deux tick() simultanés (webhook + cron) déclenchent le même agent
const _tickInProgress = new Set();

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'mxh77';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'MonPetitRoadtrip';
const GITHUB_PAT   = process.env.GITHUB_PAT   || '';

// ─── Limites garde-fous ────────────────────────────────────────────────────────
const MAX_RETRY_COUNT       = 3;   // cycles fix→review max
const MAX_TOTAL_TRANSITIONS = 50;  // transitions totales max
const LOCK_DURATION_MS      = 20 * 60 * 1000; // 20 min verrou par défaut

// Cooldown minimum entre deux tentatives de la même étape (ms)
const COOLDOWN = {
  // États "running" : verrou long pour laisser l'agent tourner
  SPEC_RUNNING    : 20 * 60 * 1000,
  DEV_RUNNING     : 20 * 60 * 1000,
  REVIEW_RUNNING  : 5  * 60 * 1000,
  FIX_RUNNING     : 10 * 60 * 1000,
  PREVIEW_RUNNING : 15 * 60 * 1000,
  QA_RUNNING      : 10 * 60 * 1000,
  DEPLOY_RUNNING  : 10 * 60 * 1000,
  // États intermédiaires "done" : pas de verrou, le prochain trigger part immédiatement
  SPEC_DONE       : 0,
  DEV_DONE        : 0,
  REVIEW_OK       : 0,
  REVIEW_PENDING  : 0,
};

// Transitions autorisées : état actuel → états suivants possibles
const ALLOWED_TRANSITIONS = {
  IDLE            : ['SPEC_RUNNING', 'DEV_RUNNING', 'REVIEW_PENDING', 'PAUSED'],
  SPEC_RUNNING    : ['SPEC_DONE', 'STUCK', 'PAUSED'],
  SPEC_DONE       : ['DEV_RUNNING', 'PAUSED'],
  DEV_RUNNING     : ['DEV_DONE', 'STUCK', 'PAUSED'],
  DEV_DONE        : ['REVIEW_PENDING', 'REVIEW_RUNNING', 'PAUSED'],
  REVIEW_PENDING  : ['REVIEW_RUNNING', 'PAUSED'],
  REVIEW_RUNNING  : ['REVIEW_RUNNING', 'REVIEW_OK', 'FIX_RUNNING', 'STUCK', 'PAUSED'],
  REVIEW_OK       : ['PREVIEW_RUNNING', 'PAUSED'],
  FIX_RUNNING     : ['REVIEW_RUNNING', 'REVIEW_PENDING', 'STUCK', 'PAUSED'],
  PREVIEW_RUNNING : ['PREVIEW_OK', 'PREVIEW_RUNNING', 'DEV_RUNNING', 'STUCK', 'PAUSED'],
  PREVIEW_OK      : ['QA_RUNNING', 'MERGE_READY', 'PAUSED'],
  QA_RUNNING      : ['QA_OK', 'STUCK', 'PAUSED'],
  QA_OK           : ['MERGE_READY', 'PAUSED'],
  MERGE_READY     : ['MERGED', 'PAUSED'],
  MERGED          : ['DEPLOY_RUNNING', 'PAUSED'],
  DEPLOY_RUNNING  : ['DEPLOYED', 'STUCK', 'PAUSED'],
  DEPLOYED        : [],
  STUCK           : ['IDLE', 'REVIEW_PENDING', 'FIX_RUNNING', 'PAUSED'],
  PAUSED          : ['IDLE', 'REVIEW_PENDING', 'PREVIEW_RUNNING', 'MERGE_READY', 'DEPLOY_RUNNING'],
};

// ─── Helpers GitHub ───────────────────────────────────────────────────────────

function githubFetch(path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`,
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MonPetitRoadtrip-Orchestrator',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 204 || !data.trim()) return resolve({ status: res.statusCode, data: null });
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function ghGet(path) {
  const { status, data } = await githubFetch(path);
  if (status >= 400) throw Object.assign(new Error(`GitHub GET ${path} → ${status}`), { status, data });
  return data;
}

async function ghPost(path, body) {
  const { status, data } = await githubFetch(path, { method: 'POST', body });
  if (status >= 400) throw Object.assign(new Error(`GitHub POST ${path} → ${status}`), { status, data });
  return data;
}

// ─── Helpers workflow ─────────────────────────────────────────────────────────

async function getOrCreate(issueNumber) {
  return prisma.devHubWorkflow.upsert({
    where:  { issueNumber },
    update: {},
    create: { issueNumber },
  });
}

async function transition(wf, newState, extra = {}) {
  const allowed = ALLOWED_TRANSITIONS[wf.state] || [];
  if (!allowed.includes(newState)) {
    console.warn(`[orchestrator] ⚠️  Transition refusée : ${wf.state} → ${newState} (issue #${wf.issueNumber})`);
    return null;
  }

  const totalTransitions = wf.totalTransitions + 1;
  if (totalTransitions > MAX_TOTAL_TRANSITIONS) {
    return markStuck(wf, `Budget de transitions épuisé (${totalTransitions})`);
  }

  const updated = await prisma.devHubWorkflow.update({
    where: { issueNumber: wf.issueNumber },
    data: {
      state: newState,
      lastTransitionAt: new Date(),
      totalTransitions,
      stuckReason: null,
      ...extra,
    },
  });
  console.log(`[orchestrator] ✅ #${wf.issueNumber} : ${wf.state} → ${newState}`);
  return updated;
}

async function markStuck(wf, reason) {
  console.error(`[orchestrator] 🔴 #${wf.issueNumber} STUCK : ${reason}`);
  // Poster un commentaire sur l'issue GitHub pour notifier l'utilisateur
  try {
    await ghPost(`issues/${wf.issueNumber}/comments`, {
      body: `## 🔴 Orchestrateur bloqué\n\n**État précédent :** \`${wf.state}\`\n\n**Raison :** ${reason}\n\nL'orchestrateur ne progressera plus automatiquement. Utilisez le DevHub pour débloquer manuellement ou relancer l'étape concernée.`,
    });
  } catch (err) {
    console.error(`[orchestrator] ⚠️  Impossible de commenter l'issue #${wf.issueNumber} :`, err.message);
  }
  return prisma.devHubWorkflow.update({
    where: { issueNumber: wf.issueNumber },
    data: { state: 'STUCK', stuckReason: reason, lockedUntil: null },
  });
}

function isLocked(wf) {
  return wf.lockedUntil && new Date(wf.lockedUntil) > new Date();
}

function lock(issueNumber, durationMs = LOCK_DURATION_MS) {
  return prisma.devHubWorkflow.update({
    where: { issueNumber },
    data: { lockedUntil: new Date(Date.now() + durationMs) },
  });
}

function unlock(issueNumber) {
  return prisma.devHubWorkflow.update({
    where: { issueNumber },
    data: { lockedUntil: null },
  });
}

function inCooldown(wf) {
  const cd = COOLDOWN[wf.state];
  if (!cd) return false;
  return (Date.now() - new Date(wf.lastTransitionAt).getTime()) < cd;
}

// ─── Logique d'évaluation ─────────────────────────────────────────────────────

/**
 * Évalue l'état GitHub réel d'une issue et décide si une transition est possible.
 * Retourne un objet { action, params } ou null si rien à faire.
 */
async function evaluate(wf) {
  const { issueNumber, state, prNumber, retryCount } = wf;

  // Vérifier si la PR existe
  let pr = null;
  if (prNumber) {
    try { pr = await ghGet(`pulls/${prNumber}`); } catch { /* ignore */ }
  }

  switch (state) {

    // ── SPEC_RUNNING → attendre que le product-spec-agent ait terminé ────────
    case 'SPEC_RUNNING': {
      const runs = await getRunsByIssue(issueNumber, 'product-spec-agent.yml', wf.lastTransitionAt);
      // Ignorer les runs skipped (déclenchés par label mais dont le job est sauté)
      const meaningful = runs.filter(r => r.conclusion !== 'skipped');
      const latest = meaningful[0];
      if (!latest) return null;
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') return { action: 'transition', transition: 'SPEC_DONE' };
      return { action: 'stuck', reason: `product-spec-agent a échoué (conclusion: ${latest.conclusion})` };
    }

    // ── SPEC_DONE → déclencher le feature-dev-agent si autoMode ───────────
    case 'SPEC_DONE': {
      if (!wf.autoMode) return null;
      return { action: 'trigger-dev', transition: 'DEV_RUNNING' };
    }

    // ── DEV_RUNNING → attendre que le feature-dev-agent ait terminé ──────
    case 'DEV_RUNNING': {
      const runs = await getRunsByIssue(issueNumber, 'feature-dev-agent.yml', wf.lastTransitionAt);
      // Ignorer les runs skipped (déclenchés par label mais dont le job est sauté)
      const meaningful = runs.filter(r => r.conclusion !== 'skipped');
      const latest = meaningful[0];
      if (!latest) return null;
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') {
        // Chercher la PR créée par le feature dev (branche issue_N ou issue-N)
        const detectedPr = await findPrByIssue(issueNumber);
        return { action: 'transition', transition: 'DEV_DONE', prNumber: detectedPr?.number ?? null };
      }
      return { action: 'stuck', reason: `feature-dev-agent a échoué (conclusion: ${latest.conclusion})` };
    }

    // ── DEV_DONE → déclencher les reviews si une PR existe ─────────────────
    case 'DEV_DONE': {
      // Si prNumber non défini, tenter de détecter la PR maintenant
      if (!pr) {
        const detectedPr = await findPrByIssue(issueNumber);
        if (!detectedPr) return null;
        // Persister le prNumber détecté
        await prisma.devHubWorkflow.update({ where: { issueNumber }, data: { prNumber: detectedPr.number } });
        pr = detectedPr;
      }
      if (pr.state !== 'open') return null;
      // Vérifier qu'aucun run review n'est déjà en cours
      const resolvedPrNumber = pr.number;
      const runs = await getRecentRuns(resolvedPrNumber, 'code-reviews.yml');
      if (runs.some(r => r.status === 'in_progress' || r.status === 'queued')) return null;
      return { action: 'trigger-reviews', transition: 'REVIEW_RUNNING', prNumber: resolvedPrNumber };
    }

    // ── REVIEW_RUNNING → évaluer le résultat des reviews ──────────────────
    case 'REVIEW_RUNNING': {
      if (!pr) return null;
      // Vérifier si le run code-reviews est encore en cours
      const reviewRuns = await getRecentRuns(prNumber, 'code-reviews.yml');
      const latestReviewRun = reviewRuns[0];
      if (latestReviewRun && (latestReviewRun.status === 'in_progress' || latestReviewRun.status === 'queued')) return null;
      // Aucun run trouvé pour cette PR → soit délai GitHub API, soit dispatch raté
      if (!latestReviewRun) {
        // Filet de sécurité : si la transition est très récente (< 2 min), le run
        // n'est peut-être pas encore visible dans l'API GitHub — on attend
        const secsSinceTransition = (Date.now() - new Date(wf.lastTransitionAt).getTime()) / 1000;
        if (secsSinceTransition < 120) return null;
        if (retryCount >= MAX_RETRY_COUNT) {
          return { action: 'stuck', reason: `code-reviews n'a jamais démarré pour PR #${prNumber} — max retries atteint` };
        }
        return { action: 'trigger-reviews', transition: 'REVIEW_RUNNING', retryCount: retryCount + 1 };
      }
      // Si le run a échoué (erreur infra, pas de labels posés), re-trigger une fois ou marquer stuck
      if (latestReviewRun.status === 'completed' && latestReviewRun.conclusion === 'failure') {
        if (retryCount >= MAX_RETRY_COUNT) {
          return { action: 'stuck', reason: `code-reviews a échoué (run #${latestReviewRun.run_number}) — max retries atteint` };
        }
        return { action: 'trigger-reviews', transition: 'REVIEW_RUNNING', retryCount: retryCount + 1 };
      }
      const labels = (pr.labels || []).map(l => l.name);
      const allOk  = ['backend', 'frontend', 'fonctionnelle'].every(s =>
        labels.some(l => l.includes(`review: ${s} ✅`) || l.includes(`review: ${s} ⚠️`))
      );
      const anyKo  = ['backend', 'frontend', 'fonctionnelle'].some(s =>
        labels.some(l => l.includes(`review: ${s} ❌`))
      );
      if (anyKo) {
        if (retryCount >= MAX_RETRY_COUNT) {
          return { action: 'stuck', reason: `Max cycles fix/review atteint (${retryCount})` };
        }
        return { action: 'fix-reviews', transition: 'FIX_RUNNING', retryCount: retryCount + 1 };
      }
      if (allOk) return { action: 'transition', transition: 'REVIEW_OK' };
      return null; // encore en cours
    }

    // ── FIX_RUNNING → retour en review quand le fix est terminé ───────────
    case 'FIX_RUNNING': {
      const runs = await getRecentRuns(prNumber, 'fix-reviews-agent.yml');
      const latest = runs[0];
      if (!latest) {
        // Filet de sécurité : si la transition est très récente (< 2 min), attendre
        const secsSinceTransition = (Date.now() - new Date(wf.lastTransitionAt).getTime()) / 1000;
        if (secsSinceTransition < 120) return null;
        return null; // toujours null — pas de re-trigger pour FIX_RUNNING sans run
      }
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') {
        return { action: 'trigger-reviews', transition: 'REVIEW_RUNNING' };
      }
      return { action: 'stuck', reason: 'fix-reviews-agent a échoué' };
    }

    // ── REVIEW_OK → déclencher le preview ──────────────────────────────────
    case 'REVIEW_OK': {
      if (!pr) return null;
      const runs = await getRecentRuns(prNumber, 'delivery-agent.yml');
      if (runs.some(r => r.status === 'in_progress' || r.status === 'queued')) return null;
      return { action: 'deploy-preview', transition: 'PREVIEW_RUNNING' };
    }

    // ── PREVIEW_RUNNING → vérifier que le preview est up ──────────────────
    case 'PREVIEW_RUNNING': {
      const runs = await getRecentRuns(prNumber, 'delivery-agent.yml');
      const latest = runs[0];
      if (!latest) return null;
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') return { action: 'transition', transition: 'PREVIEW_OK' };
      // Échec du delivery → relire les logs pour extraire l'erreur et renvoyer au dev agent
      if (retryCount >= MAX_RETRY_COUNT) {
        return { action: 'stuck', reason: `delivery-agent a échoué (run #${latest.run_number}) — max retries atteint` };
      }
      // Récupérer le résumé de l'erreur depuis les jobs du run
      let buildError = 'Le déploiement preview a échoué.';
      try {
        const jobs = await ghGet(`actions/runs/${latest.id}/jobs`);
        const failedJob = (jobs.jobs || []).find(j => j.conclusion === 'failure');
        const failedStep = failedJob?.steps?.find(s => s.conclusion === 'failure');
        if (failedStep) buildError = `Échec de l'étape "${failedStep.name}" dans le job "${failedJob.name}" lors du déploiement preview (run #${latest.run_number}).`;
      } catch {}
      return { action: 'trigger-dev-fix', transition: 'DEV_RUNNING', retryCount: retryCount + 1, feedback: buildError };
    }

    // ── PREVIEW_OK → prêt pour merge (action manuelle, pas de QA auto) ────
    case 'PREVIEW_OK': {
      return { action: 'transition', transition: 'MERGE_READY' };
    }

    // ── QA_RUNNING → vérifier le résultat QA ──────────────────────────────
    case 'QA_RUNNING': {
      const runs = await getRecentRuns(prNumber, 'qa-report.yml');
      const latest = runs[0];
      if (!latest) return null;
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') return { action: 'transition', transition: 'QA_OK' };
      return { action: 'stuck', reason: 'qa-report a échoué' };
    }

    // ── QA_OK → prêt pour merge (manuel par défaut) ─────────────────────
    case 'QA_OK': {
      return { action: 'transition', transition: 'MERGE_READY' };
    }

    // ── MERGED → déclencher le déploiement production (si autoMode) ───────
    case 'MERGED': {
      if (!wf.autoMode) return null;
      return { action: 'deploy-production', transition: 'DEPLOY_RUNNING' };
    }

    // ── DEPLOY_RUNNING → vérifier que le déploiement est terminé ──────────
    case 'DEPLOY_RUNNING': {
      const runs = await getMasterRuns('deploy-production.yml');
      const latest = runs[0];
      if (!latest) return null;
      if (latest.status === 'in_progress' || latest.status === 'queued') return null;
      if (latest.conclusion === 'success') return { action: 'transition', transition: 'DEPLOYED' };
      return { action: 'stuck', reason: 'deploy-production a échoué' };
    }

    default:
      return null;
  }
}

// Cherche la PR GitHub associée à une issue (branche issue_N ou issue-N)
async function findPrByIssue(issueNumber) {
  try {
    const prs = await ghGet('pulls?state=open&per_page=50');
    return (prs || []).find(p => {
      const branch = p.head?.ref || '';
      return branch.includes(`issue_${issueNumber}`) || branch.includes(`issue-${issueNumber}`) || branch.includes(`issue/${issueNumber}`);
    }) ?? null;
  } catch { return null; }
}

async function getRecentRuns(prNumber, workflow) {
  try {
    const prTag = new RegExp(`#${prNumber}(\\s|$)`);
    const data = await ghGet(`actions/runs?branch=master&per_page=30`);
    return (data?.workflow_runs || [])
      .filter(r => r.path?.includes(workflow) && prTag.test(r.display_title ?? ''))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch { return []; }
}

async function getRunsByIssue(issueNumber, workflow, since) {
  try {
    const tag = new RegExp(`#${issueNumber}(\\s|$)`);
    const data = await ghGet(`actions/runs?per_page=30`);
    // Tolérance de 60s : le run peut être créé quelques secondes AVANT la transition en DB
    const sinceMs = since ? new Date(since).getTime() - 60_000 : null;
    return (data?.workflow_runs || [])
      .filter(r => r.path?.includes(workflow) && tag.test(r.display_title ?? '')
        && (!sinceMs || new Date(r.created_at).getTime() >= sinceMs))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch { return []; }
}

async function getMasterRuns(workflow) {
  try {
    const data = await ghGet(`actions/runs?branch=master&per_page=20`);
    return (data?.workflow_runs || [])
      .filter(r => r.path?.includes(workflow))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch { return []; }
}

// ─── Exécution d'une action ───────────────────────────────────────────────────

async function executeAction(wf, decision) {
  const { issueNumber, prNumber } = wf;

  if (decision.action === 'stuck') {
    return markStuck(wf, decision.reason);
  }

  if (decision.action === 'transition') {
    const extra = {};
    if (decision.prNumber !== undefined) extra.prNumber = decision.prNumber;
    return transition(wf, decision.transition, extra);
  }

  // Poser le verrou avant de déclencher l'agent
  await lock(issueNumber, COOLDOWN[decision.transition] || LOCK_DURATION_MS);

  try {
    if (decision.action === 'trigger-reviews') {
      await ghPost('actions/workflows/code-reviews.yml/dispatches', {
        ref: 'master',
        inputs: { pr_number: String(prNumber) },
      });
    }

    if (decision.action === 'trigger-dev') {
      const aiModel = wf.metadata?.ai_model || 'deepseek-v4-flash';
      await ghPost('actions/workflows/feature-dev-agent.yml/dispatches', {
        ref: 'master',
        inputs: { issue_number: String(issueNumber), ai_model: aiModel },
      });
    }

    if (decision.action === 'trigger-dev-fix') {
      const aiModel = wf.metadata?.ai_model || 'deepseek-v4-flash';
      await ghPost('actions/workflows/feature-dev-agent.yml/dispatches', {
        ref: 'master',
        inputs: {
          issue_number: String(issueNumber),
          ai_model: aiModel,
          feedback: decision.feedback || 'Le déploiement preview a échoué, corrige les erreurs de build.',
        },
      });
    }

    if (decision.action === 'fix-reviews') {
      await ghPost('actions/workflows/fix-reviews-agent.yml/dispatches', {
        ref: 'master',
        inputs: { pr_number: String(prNumber) },
      });
    }

    if (decision.action === 'deploy-preview') {
      await ghPost('actions/workflows/delivery-agent.yml/dispatches', {
        ref: 'master',
        inputs: { pr_number: String(prNumber) },
      });
    }

    if (decision.action === 'qa') {
      await ghPost('actions/workflows/qa-report.yml/dispatches', {
        ref: 'master',
        inputs: { pr_number: String(prNumber) },
      });
    }

    if (decision.action === 'deploy-production') {
      await ghPost('actions/workflows/deploy-production.yml/dispatches', { ref: 'master', inputs: {} });
    }

    const transitionExtra = {
      retryCount: decision.retryCount !== undefined ? decision.retryCount : wf.retryCount,
    };
    if (decision.prNumber !== undefined) transitionExtra.prNumber = decision.prNumber;
    return transition(wf, decision.transition, transitionExtra);
  } catch (err) {
    console.error(`[orchestrator] ❌ Action ${decision.action} échouée :`, err.message);
    await unlock(issueNumber);
    return null;
  }
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

/**
 * Évalue et fait avancer le workflow d'une issue donnée.
 * Appelé par le cron et par les routes manuelles.
 */
// États "done" intermédiaires : le verrou y est toujours obsolète
// (l'agent précédent a déjà terminé, sinon on ne serait pas dans cet état)
const DONE_STATES = new Set(['SPEC_DONE', 'DEV_DONE', 'REVIEW_OK', 'PREVIEW_OK', 'QA_OK', 'MERGE_READY', 'MERGED']);

async function tick(issueNumber) {
  // Mutex : si un tick est déjà en cours pour cette issue, on ignore l'appel concurrent
  if (_tickInProgress.has(issueNumber)) {
    console.log(`[orchestrator] ⏭ #${issueNumber} tick() ignoré — déjà en cours`);
    return;
  }
  _tickInProgress.add(issueNumber);
  try {
    return await _tickInner(issueNumber);
  } finally {
    _tickInProgress.delete(issueNumber);
  }
}

async function _tickInner(issueNumber) {
  // Boucle pour enchaîner les transitions pures sans attendre le cron
  // Ex: DEV_RUNNING → DEV_DONE (transition) → trigger-reviews (action) → stop
  const MAX_STEPS = 8;
  let wf = await getOrCreate(issueNumber);

  for (let step = 0; step < MAX_STEPS; step++) {
    if (wf.state === 'DEPLOYED' || wf.state === 'PAUSED') return wf;

    // Auto-unlock si on est dans un état "done" : le verrou y est toujours périmé
    // (l'agent précédent a terminé, c'est pour ça qu'on est dans cet état)
    if (DONE_STATES.has(wf.state) && isLocked(wf)) {
      console.log(`[orchestrator] 🔓 #${issueNumber} auto-unlock en état ${wf.state} (verrou obsolète)`);
      wf = await unlock(issueNumber);
      wf = await getOrCreate(issueNumber);
    }

    const decision = await evaluate(wf);
    if (!decision) return wf;

    // Le verrou et le cooldown ne bloquent que les déclenchements d'agents
    if (decision.action !== 'transition' && decision.action !== 'stuck') {
      if (isLocked(wf)) {
        console.log(`[orchestrator] 🔒 #${issueNumber} verrouillé jusqu'à ${wf.lockedUntil}`);
        return wf;
      }
      if (inCooldown(wf)) {
        console.log(`[orchestrator] ⏳ #${issueNumber} en cooldown (état ${wf.state})`);
        return wf;
      }
    }

    wf = await executeAction(wf, decision);
    if (!wf) return wf;

    // Si on vient de déclencher un agent (pas juste une transition pure), on s'arrête
    // pour ne pas enchaîner un 2ᵉ déclenchement avant que l'agent ait tourné
    if (decision.action !== 'transition') return wf;

    // Transition pure effectuée → on relit le wf et on continue la boucle
    wf = await getOrCreate(issueNumber);
  }

  console.warn(`[orchestrator] ⚠️ #${issueNumber} tick() a atteint MAX_STEPS (${MAX_STEPS}) — boucle détectée ?`);
  return wf;
}

/**
 * Passe en revue toutes les issues en cours et les fait avancer.
 * Appelé par le cron toutes les 2 minutes.
 */
async function tickAll() {
  const active = await prisma.devHubWorkflow.findMany({
    where: {
      state: { notIn: ['DEPLOYED', 'PAUSED', 'IDLE', 'MERGE_READY', 'MERGED', 'STUCK'] },
    },
  });

  console.log(`[orchestrator] 🔄 tickAll — ${active.length} workflow(s) actif(s)`);
  for (const wf of active) {
    try { await tick(wf.issueNumber); }
    catch (err) { console.error(`[orchestrator] Erreur tick #${wf.issueNumber} :`, err.message); }
  }
}

module.exports = { tick, tickAll, getOrCreate, transition, markStuck, unlock, ALLOWED_TRANSITIONS };
