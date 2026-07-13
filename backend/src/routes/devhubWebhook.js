/**
 * Webhook GitHub pour les workflow_run events.
 * Monté dans index.js AVANT express.json() pour pouvoir lire le raw body
 * et valider la signature HMAC-SHA256.
 *
 * Endpoint : POST /api/devhub/webhook
 * Secret   : GITHUB_WEBHOOK_SECRET (variable d'environnement)
 */

const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const orchestrator = require('../lib/devhubOrchestrator');
const { githubGet } = require('../lib/githubApi');
const sseBus = require('../lib/sseBus');

const router = express.Router();
const prisma = new PrismaClient();

// Regex pour extraire le numéro d'issue depuis le nom d'un run d'agent
// ex: "Product Spec Agent - Issue #24" → 24
// ex: "Feature Dev Agent - Issue #24" → 24
const ISSUE_RUN_RE = /Issue\s+#(\d+)/i;

// Regex pour extraire le numéro de PR depuis le nom d'un run de review/delivery/fix/qa
// ex: "Code Reviews — PR #38" → 38
// ex: "Delivery Agent - PR #38" → 38
// ex: "Fix Reviews - PR #38" → 38
// ex: "QA Fix - PR #38" → 38
const PR_RUN_RE = /PR\s+#(\d+)/i;

// Workflows organisés par type de contexte
// Issue-based: le display_title contient "Issue #N"
const ISSUE_WORKFLOWS = ['product-spec-agent.yml', 'feature-dev-agent.yml'];
// PR-based: le display_title contient "PR #N"
const PR_WORKFLOWS = [
  'code-reviews.yml',
  'fix-reviews-agent.yml',
  'fix-pr-reviews.yml',
  'delivery-agent.yml',
  'qa-report.yml',
];
// Master-based: pas de numéro dans le titre, tournent sur master
const MASTER_WORKFLOWS = ['deploy-production.yml'];

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

// ─── Vérification signature GitHub ───────────────────────────────────────────

function verifySignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) return true; // en dev sans secret, on passe
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

// ─── Classification du type d'agent ──────────────────────────────────────────

function classifyRunType(run) {
  const n = (run.name ?? '').toLowerCase();
  const p = (run.path ?? '').toLowerCase();
  if (n.includes('product-spec') || p.includes('product-spec')) return 'spec';
  if (n.includes('feature-dev')  || p.includes('feature-dev'))  return 'dev';
  if (n.includes('deploy-prod')  || p.includes('deploy-prod'))  return 'prod';
  if (n.includes('delivery')     || p.includes('delivery'))     return 'preview';
  if (n.includes('qa')           || p.includes('qa-report'))    return 'qa';
  if ((n.includes('fix') && n.includes('review')) || p.includes('fix-review') || p.includes('fix-pr')) return 'fix';
  if (n.includes('review')       || p.includes('code-review'))  return 'review';
  return null;
}

// ─── Upsert d'un run dans la DB ───────────────────────────────────────────────

async function upsertRun(run) {
  if (!run?.id) return;
  const runType     = classifyRunType(run);
  const matchIssue  = ISSUE_RUN_RE.exec(run.display_title ?? run.name ?? '');
  const issueNumber = matchIssue ? Number(matchIssue[1]) : null;
  const headSha     = run.head_sha ?? null;

  await prisma.githubRun.upsert({
    where: { id: BigInt(run.id) },
    create: {
      id:           BigInt(run.id),
      name:         run.name ?? null,
      displayTitle: run.display_title ?? null,
      path:         run.path ?? null,
      headBranch:   run.head_branch ?? null,
      status:       run.status ?? 'unknown',
      conclusion:   run.conclusion ?? null,
      htmlUrl:      run.html_url ?? null,
      createdAt:    run.created_at ? new Date(run.created_at) : new Date(),
      updatedAt:    run.updated_at ? new Date(run.updated_at) : new Date(),
      runStartedAt: run.run_started_at ? new Date(run.run_started_at) : null,
      event:        run.event ?? null,
      rawJson:      run,
      runType,
      issueNumber,
      headSha,
    },
    update: {
      name:         run.name ?? null,
      displayTitle: run.display_title ?? null,
      path:         run.path ?? null,
      headBranch:   run.head_branch ?? null,
      status:       run.status ?? 'unknown',
      conclusion:   run.conclusion ?? null,
      htmlUrl:      run.html_url ?? null,
      updatedAt:    run.updated_at ? new Date(run.updated_at) : new Date(),
      runStartedAt: run.run_started_at ? new Date(run.run_started_at) : null,
      event:        run.event ?? null,
      rawJson:      run,
      syncedAt:     new Date(),
      runType,
      issueNumber,
      headSha,
    },
  });
}

// ─── Sauvegarde des commits d'un run en DB ────────────────────────────────────
// Appelée uniquement quand run.status === 'completed'
// Stratégie : comparer head_sha du run avec le head_sha du run précédent du même type
// pour la même issue → GitHub compare API → liste exacte des commits de ce run

async function saveRunCommits(run) {
  if (!run?.id || !run.head_sha) return;
  const runId      = BigInt(run.id);
  const runType    = classifyRunType(run);
  const matchIssue = ISSUE_RUN_RE.exec(run.display_title ?? run.name ?? '');
  const matchPR    = PR_RUN_RE.exec(run.display_title ?? run.name ?? '');

  try {
    // Trouver le run précédent du même type pour la même issue/PR
    let prevHeadSha = null;

    if (matchIssue) {
      const issueNumber = Number(matchIssue[1]);
      const prevRun = await prisma.githubRun.findFirst({
        where: {
          issueNumber,
          runType,
          id:     { not: runId },
          headSha: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      prevHeadSha = prevRun?.headSha ?? null;
    } else if (matchPR && run.head_branch) {
      // Pour les agents PR-based, chercher le précédent sur la même branche avec le même type
      const prevRun = await prisma.githubRun.findFirst({
        where: {
          headBranch: run.head_branch,
          runType,
          id:         { not: runId },
          headSha:    { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      prevHeadSha = prevRun?.headSha ?? null;
    }

    let commits = [];
    if (prevHeadSha && prevHeadSha !== run.head_sha) {
      // compare/{base}...{head} : commits entre les deux runs
      const cmp = await githubGet(`compare/${prevHeadSha}...${run.head_sha}`);
      commits = cmp?.commits ?? [];
    } else if (!prevHeadSha) {
      // Pas de run précédent : prendre uniquement le commit HEAD
      try {
        const c = await githubGet(`commits/${run.head_sha}`);
        if (c) commits = [c];
      } catch { /* si pas de commit, on passe */ }
    }
    // Si prevHeadSha === head_sha : rien de nouveau, commits reste []

    if (commits.length === 0) return;

    // Upsert chaque commit dans github_run_commits
    await Promise.all(commits.map(c =>
      prisma.githubRunCommit.upsert({
        where: { runId_sha: { runId, sha: c.sha } },
        create: {
          runId,
          sha:         c.sha,
          message:     c.commit?.message?.split('\n')[0] ?? null,
          author:      c.commit?.author?.name ?? null,
          committedAt: c.commit?.author?.date ? new Date(c.commit.author.date) : null,
        },
        update: {
          message:     c.commit?.message?.split('\n')[0] ?? null,
          author:      c.commit?.author?.name ?? null,
          committedAt: c.commit?.author?.date ? new Date(c.commit.author.date) : null,
        },
      })
    ));

    console.log(`[webhook] saveRunCommits: ${commits.length} commit(s) sauvegardés pour run #${run.id} (${runType})`);
  } catch (err) {
    console.error(`[webhook] saveRunCommits error run #${run.id}:`, err.message);
  }
}

// ─── Route webhook ────────────────────────────────────────────────────────────
// Utilise express.raw() pour accéder au body brut nécessaire à la vérification HMAC
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['x-hub-signature-256'] || '';
    if (!verifySignature(req.body, sig)) {
      console.warn('[devhub-webhook] Signature invalide');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const event = req.headers['x-github-event'];

    if (event === 'workflow_run') {
      const run = payload.workflow_run;
      try {
        await upsertRun(run);
        console.log(`[devhub-webhook] workflow_run #${run?.id} (${run?.status}) → DB OK`);

        // Notifier tous les clients SSE connectés
        const matchIssueNotif = ISSUE_RUN_RE.exec(run?.display_title ?? run?.name ?? '');
        const matchPRNotif    = PR_RUN_RE.exec(run?.display_title ?? run?.name ?? '');
        sseBus.notify('run_updated', {
          runId:       run?.id,
          runType:     classifyRunType(run),
          status:      run?.status,
          conclusion:  run?.conclusion,
          issueNumber: matchIssueNotif ? Number(matchIssueNotif[1]) : null,
          prNumber:    matchPRNotif    ? Number(matchPRNotif[1])    : null,
          headBranch:  run?.head_branch ?? null,
          name:        run?.name ?? null,
        });
      } catch (err) {
        console.error('[devhub-webhook] Erreur upsert:', err.message);
      }

      // Déclencher l'orchestrateur automatiquement quand un run agent se termine
      if (run?.status === 'completed') {
        // Sauvegarder les commits de ce run en DB (async, non bloquant)
        saveRunCommits(run).catch(err =>
          console.error('[webhook] saveRunCommits failed:', err.message)
        );

        const title        = run.display_title ?? run.name ?? '';
        const workflowPath = run.path ?? '';
        const matchIssue   = ISSUE_RUN_RE.exec(title);
        const matchPR      = PR_RUN_RE.exec(title);
        const isMaster     = MASTER_WORKFLOWS.some(w => workflowPath.includes(w));

        if (matchIssue) {
          // ── Agents Issue-based (spec, dev) ───────────────────────────────
          const issueNumber = Number(matchIssue[1]);
          console.log(`[webhook] ${workflowPath} terminé (${run.conclusion}) → tick issue #${issueNumber}`);

          setImmediate(async () => {
            try {
              const wf = await orchestrator.getOrCreate(issueNumber);

              // Lever le verrou uniquement si le workflow terminé correspond à l'agent attendu
              // dans l'état actuel — évite d'effacer un verrou posé par un dispatch ultérieur
              const stateMatchesWorkflow =
                (wf.state === 'SPEC_RUNNING' && workflowPath.includes('product-spec-agent')) ||
                (wf.state === 'DEV_RUNNING'  && workflowPath.includes('feature-dev-agent'));
              if (stateMatchesWorkflow) {
                await orchestrator.unlock(issueNumber);
              }

              // Rattrapage si agent lancé manuellement hors DevHub (état IDLE)
              // ou si l'orchestrateur s'est coincé à cause d'un run skipped (état STUCK)
              if ((wf.state === 'IDLE' || wf.state === 'STUCK') && run.conclusion === 'success') {
                if (workflowPath.includes('product-spec-agent')) {
                  // Remettre en IDLE d'abord si STUCK (pour permettre la transition)
                  if (wf.state === 'STUCK') {
                    await prisma.devHubWorkflow.update({ where: { issueNumber }, data: { state: 'IDLE', stuckReason: null } });
                  }
                  // Utiliser findUnique (pas getOrCreate) pour récupérer l'état fraîchement mis à jour
                  const wfFresh = await prisma.devHubWorkflow.findUnique({ where: { issueNumber } });
                  await orchestrator.transition(wfFresh, 'SPEC_RUNNING');
                  const wf2 = await prisma.devHubWorkflow.findUnique({ where: { issueNumber } });
                  await orchestrator.transition(wf2, 'SPEC_DONE');
                } else if (workflowPath.includes('feature-dev-agent')) {
                  if (wf.state === 'STUCK') {
                    await prisma.devHubWorkflow.update({ where: { issueNumber }, data: { state: 'IDLE', stuckReason: null } });
                  }
                  const wfFresh = await prisma.devHubWorkflow.findUnique({ where: { issueNumber } });
                  await orchestrator.transition(wfFresh, 'DEV_RUNNING');
                  const wf2 = await prisma.devHubWorkflow.findUnique({ where: { issueNumber } });
                  await orchestrator.transition(wf2, 'DEV_DONE');
                }
              }

              await orchestrator.tick(issueNumber);
            } catch (err) {
              console.error(`[webhook] Erreur tick issue #${issueNumber}:`, err.message);
            }
          });

        } else if (matchPR) {
          // ── Agents PR-based (reviews, fix, delivery, qa) ─────────────────
          const prNumber = Number(matchPR[1]);
          console.log(`[webhook] ${workflowPath} terminé (${run.conclusion}) → tick PR #${prNumber}`);

          setImmediate(async () => {
            try {
              const wf = await prisma.devHubWorkflow.findFirst({ where: { prNumber } });
              if (!wf) {
                console.warn(`[webhook] Aucun workflow trouvé pour PR #${prNumber}`);
                return;
              }
              // Lever le verrou uniquement si le workflow terminé correspond à l'agent attendu
              // dans l'état actuel — évite d'effacer un verrou posé par un dispatch ultérieur
              const stateMatchesWorkflow =
                (wf.state === 'REVIEW_RUNNING'  && workflowPath.includes('code-reviews')) ||
                (wf.state === 'FIX_RUNNING'     && workflowPath.includes('fix-reviews-agent')) ||
                (wf.state === 'PREVIEW_RUNNING' && workflowPath.includes('delivery-agent')) ||
                (wf.state === 'QA_RUNNING'      && workflowPath.includes('qa-report'));
              if (stateMatchesWorkflow) {
                await orchestrator.unlock(wf.issueNumber);
              }
              await orchestrator.tick(wf.issueNumber);
            } catch (err) {
              console.error(`[webhook] Erreur tick PR #${prNumber}:`, err.message);
            }
          });

        } else if (isMaster) {
          // ── Agents Master-based (deploy-production) ──────────────────────
          console.log(`[webhook] ${workflowPath} terminé (${run.conclusion}) → tick DEPLOY_RUNNING`);

          setImmediate(async () => {
            try {
              const wfs = await prisma.devHubWorkflow.findMany({ where: { state: 'DEPLOY_RUNNING' } });
              for (const wf of wfs) {
                // Pour les runs master, on ne lève le verrou que si le deploy-production est bien le workflow terminé
                if (workflowPath.includes('deploy-production')) {
                  await orchestrator.unlock(wf.issueNumber);
                }
                await orchestrator.tick(wf.issueNumber);
              }
            } catch (err) {
              console.error(`[webhook] Erreur tick DEPLOY_RUNNING:`, err.message);
            }
          });

        } else {
          console.log(`[webhook] Workflow non géré: ${workflowPath} — ignoré`);
        }
      }
    }

    // Toujours répondre 200 rapidement (GitHub retente sinon)
    res.status(200).json({ received: true });
  }
);

module.exports = { router, upsertRun, classifyRunType };
