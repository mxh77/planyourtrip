const express = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const orchestrator = require('../lib/devhubOrchestrator');
const { upsertRun } = require('./devhubWebhook');
const sseBus = require('../lib/sseBus');

const router = express.Router();
const prisma = new PrismaClient();

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'mxh77';
const GITHUB_REPO = process.env.GITHUB_REPO || 'MonPetitRoadtrip';
const GITHUB_PAT = process.env.GITHUB_PAT || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ─── Middleware requireAdmin local ────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
  req.user = payload;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

router.use(requireAdmin);

// ─── Helper GitHub API ────────────────────────────────────────────────────────

function githubFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`);
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : null;

    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'MonPetitRoadtrip-DevHub/1.0',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 204 || !data.trim()) {
          return resolve({ status: res.statusCode, data: null });
        }
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function githubGet(path) {
  const { status, data } = await githubFetch(path);
  if (status >= 400) {
    const err = new Error(`GitHub GET ${path} → ${status}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

async function githubPost(path, body) {
  const { status, data } = await githubFetch(path, { method: 'POST', body });
  if (status >= 400) {
    const err = new Error(`GitHub POST ${path} → ${status}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

async function githubPatch(path, body) {
  const { status, data } = await githubFetch(path, { method: 'PATCH', body });
  if (status >= 400) {
    const err = new Error(`GitHub PATCH ${path} → ${status}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

async function githubPut(path, body) {
  const { status, data } = await githubFetch(path, { method: 'PUT', body });
  if (status >= 400) {
    const err = new Error(`GitHub PUT ${path} → ${status}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

async function githubDelete(path) {
  const { status, data } = await githubFetch(path, { method: 'DELETE' });
  if (status >= 400 && status !== 404) {
    const err = new Error(`GitHub DELETE ${path} → ${status}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

// Pagine automatiquement jusqu'à maxPages pages (100 items/page)
// Fonctionne pour les endpoints qui renvoient un tableau ou { workflow_runs: [] }
async function githubGetAllPages(basePath, maxPages = 5) {
  const separator = basePath.includes('?') ? '&' : '?';
  const allItems = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await githubGet(`${basePath}${separator}per_page=100&page=${page}`);
    const items = Array.isArray(data) ? data : (data?.workflow_runs ?? []);
    allItems.push(...items);
    if (items.length < 100) break; // dernière page
  }
  return allItems;
}

function openAIFetch(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const reqOptions = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── GET /issues ──────────────────────────────────────────────────────────────

router.get('/issues', async (req, res) => {
  try {
    const label = req.query.label || '';
    const state = req.query.state || 'all';
    let path = `issues?state=${state}&per_page=100&sort=created&direction=desc`;
    if (label) path += `&labels=${encodeURIComponent(label)}`;
    const issues = await githubGet(path);
    // Exclure les PR (issues avec pull_request)
    const filtered = Array.isArray(issues) ? issues.filter((i) => !i.pull_request) : [];
    res.json(filtered);
  } catch (err) {
    console.error('[devhub] GET /issues:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /issues/:number/prs ──────────────────────────────────────────────────

router.get('/issues/:number/prs', async (req, res) => {
  try {
    const number = req.params.number;
    // Chercher des PRs dont la branche contient "issue-N"
    const searchResult = await githubGet(`pulls?state=all&per_page=100`);
    const filtered = Array.isArray(searchResult)
      ? searchResult.filter((pr) => {
          const branch = pr.head?.ref || '';
          return branch.includes(`issue-${number}`) || branch.includes(`issue/${number}`) || branch.includes(`issue_${number}`);
        })
      : [];
    res.json(filtered);
  } catch (err) {
    console.error('[devhub] GET /issues/:number/prs:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /issues/:number/runs ─────────────────────────────────────────────────

router.get('/issues/:number/runs', async (req, res) => {
  try {
    const number = req.params.number;
    const issueTag = new RegExp(`#${number}(\\s|$|[^0-9])`);

    // Toujours syncer depuis l'API GitHub pour avoir les runs les plus récents,
    // puis upsert en DB (les webhooks gardent la DB à jour en prod, mais ici
    // on garantit la fraîcheur même sans webhook actif)
    const workflows = ['product-spec-agent.yml', 'feature-dev-agent.yml'];
    let allRuns = [];
    for (const wf of workflows) {
      const wfRuns = await githubGetAllPages(`actions/workflows/${wf}/runs`);
      const runs = wfRuns.filter((r) => {
        const branch = r.head_branch || '';
        return (
          branch.includes(`issue_${number}`) ||
          branch.includes(`issue-${number}`) ||
          issueTag.test(r.display_title ?? '')
        );
      });
      allRuns.push(...runs);
      await Promise.all(runs.map(upsertRun));
    }

    allRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(allRuns);
  } catch (err) {
    console.error('[devhub] GET /issues/:number/runs:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /issues/:number/agent-comments ──────────────────────────────────────
// Retourne uniquement les commentaires postés par l'orchestrateur sur l'issue

router.get('/issues/:number/agent-comments', async (req, res) => {
  try {
    const comments = await githubGet(`issues/${req.params.number}/comments?per_page=100`);
    const agentComments = (Array.isArray(comments) ? comments : []).filter(c =>
      c.body && (
        c.body.includes('Orchestrateur bloqué') ||
        c.body.includes('orchestrateur') ||
        c.body.includes('feature-dev-agent') ||
        c.body.includes('product-spec-agent')
      )
    );
    res.json(agentComments);
  } catch (err) {
    console.error('[devhub] GET /issues/:number/agent-comments:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/files ───────────────────────────────────────────────────

router.get('/prs/:number/files', async (req, res) => {
  try {
    const files = await githubGet(`pulls/${req.params.number}/files?per_page=100`);
    res.json(files);
  } catch (err) {
    console.error('[devhub] GET /prs/:number/files:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/commits ─────────────────────────────────────────────────

router.get('/prs/:number/commits', async (req, res) => {
  try {
    const commits = await githubGet(`pulls/${req.params.number}/commits?per_page=50`);
    res.json(commits);
  } catch (err) {
    console.error('[devhub] GET /prs/:number/commits:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/runs ────────────────────────────────────────────────────
// Les runs liés à une PR viennent de deux sources :
//   1. Runs sur la branche de la PR (déclenchés par pull_request event)
//   2. Runs sur master déclenchés via workflow_dispatch avec pr_number en input
//      (code-reviews.yml, delivery-agent.yml, fix-reviews-agent.yml, qa-report.yml)
//      → leur run_name contient "#<prNumber>"

// Workflows déclenchés via dispatch sur master mais liés à une PR spécifique
const PR_DISPATCH_WORKFLOWS = ['code-reviews.yml', 'delivery-agent.yml', 'fix-reviews-agent.yml', 'qa-report.yml'];

router.get('/prs/:number/runs', async (req, res) => {
  try {
    const prNumber = req.params.number;
    const prTag = new RegExp(`#${prNumber}(\\s|$)`);

    // Toujours syncer depuis GitHub API pour garantir la fraîcheur (sans webhook actif)
    const pr = await githubGet(`pulls/${prNumber}`);
    const branch = pr.head?.ref || '';

    const seen = new Set();
    const runs = [];

    // Runs sur la branche de la PR
    const branchRuns = await githubGetAllPages(`actions/runs?branch=${encodeURIComponent(branch)}`);
    for (const r of branchRuns) { seen.add(r.id); runs.push(r); }

    // Runs dispatch liés à la PR (code-reviews, delivery, etc.)
    for (const wf of PR_DISPATCH_WORKFLOWS) {
      const wfRuns = await githubGetAllPages(`actions/workflows/${wf}/runs`);
      for (const r of wfRuns) {
        if (!seen.has(r.id) && prTag.test(r.display_title ?? '')) {
          runs.push(r);
          seen.add(r.id);
        }
      }
    }

    await Promise.all(runs.map(upsertRun));

    runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(runs);
  } catch (err) {
    console.error('[devhub] GET /prs/:number/runs:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/review-status ──────────────────────────────────────────

router.get('/prs/:number/review-status', async (req, res) => {
  try {
    const pr = await githubGet(`pulls/${req.params.number}`);
    const labels = (pr.labels || []).map((l) => l.name);
    const branch = pr.head?.ref || '';
    // Toute branche de feature (branch_issue_N, feature-dev/..., feature/...)
    const isFeatureBranch = branch.startsWith('feature-dev/') || branch.startsWith('feature/')
      || /^branch_issue_\d+/.test(branch) || /^feature[-_]/.test(branch);

    const getStatus = (scope) => {
      const approved = labels.some((l) => l.includes(`review: ${scope} ✅`));
      const warning = labels.some((l) => l.includes(`review: ${scope} ⚠️`));
      const blocked = labels.some((l) => l.includes(`review: ${scope} ❌`));
      if (blocked) return 'blocked';
      if (warning) return 'warning';
      if (approved) return 'approved';
      return isFeatureBranch ? 'pending' : null;
    };

    res.json({
      backend: getStatus('backend'),
      frontend: getStatus('frontend'),
      functional: getStatus('fonctionnelle'),
    });
  } catch (err) {
    console.error('[devhub] GET /prs/:number/review-status:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/all-comments ──────────────────────────────────────────
// Retourne tous les commentaires postés sur la PR (issue comments)

router.get('/prs/:number/all-comments', async (req, res) => {
  try {
    const comments = await githubGet(`issues/${req.params.number}/comments?per_page=100`);
    res.json(Array.isArray(comments) ? comments : []);
  } catch (err) {
    console.error('[devhub] GET /prs/:number/all-comments:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/review-comments ────────────────────────────────────────

router.get('/prs/:number/review-comments', async (req, res) => {
  try {
    const comments = await githubGet(`issues/${req.params.number}/comments?per_page=100`);
    const botComments = Array.isArray(comments)
      ? comments.filter((c) => c.user?.login === 'github-actions[bot]')
      : [];

    const reviewPattern = /<!--\s*review:(backend|frontend|functional)(?:\s+run_id=(\S+))?(?:\s+run_url=(\S+))?\s*-->/;
    const latest = {};

    for (const comment of botComments) {
      const body = comment.body || '';
      const match = body.match(reviewPattern);
      if (!match) continue;

      const scope = match[1];
      const run_id = match[2] || null;
      const run_url = match[3] || null;

      if (!latest[scope] || comment.created_at > latest[scope].created_at) {
        latest[scope] = { ...comment, run_id, run_url };
      }
    }

    // Dernier commentaire posté par le fix-reviews agent
    const fixComments = botComments.filter((c) => (c.body || '').includes('Fix Reviews Agent'));
    const latestFix = fixComments.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (latestFix) {
      latest['fix'] = { ...latestFix, scope: 'fix', run_id: null, run_url: null };
    }

    res.json(Object.values(latest));
  } catch (err) {
    console.error('[devhub] GET /prs/:number/review-comments:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/override-review ──────────────────────────────────────
// Passe outre un blocage de review : ❌ → ⚠️ et pose le label review:override
// pour empêcher l'auto-fix de boucler.

router.post('/prs/:number/override-review', async (req, res) => {
  try {
    const prNumber = req.params.number;
    const { scope } = req.body; // 'backend' | 'frontend' | 'functional'
    if (!scope) return res.status(400).json({ error: 'scope requis' });

    const allLabels = await githubGet(`issues/${prNumber}/labels?per_page=100`);
    const labelNames = (Array.isArray(allLabels) ? allLabels : []).map((l) => l.name);

    // Supprimer le label ❌ et ⚠️ existants pour ce scope
    const toRemove = [`review: ${scope} ❌`, `review: ${scope} ⚠️`];
    for (const label of toRemove) {
      if (labelNames.includes(label)) {
        await githubDelete(`issues/${prNumber}/labels/${encodeURIComponent(label)}`);
      }
    }

    // Poser le label ⚠️ (avertissement accepté)
    const warningLabel = `review: ${scope} ⚠️`;
    const existingLabels = await githubGet('labels?per_page=100');
    const existingNames = (Array.isArray(existingLabels) ? existingLabels : []).map((l) => l.name);
    const colorMap = { backend: 'e4a817', frontend: 'e4a817', functional: 'e4a817' };
    if (!existingNames.includes(warningLabel)) {
      await githubPost('labels', { name: warningLabel, color: colorMap[scope] || 'e4a817' });
    }
    await githubPost(`issues/${prNumber}/labels`, { labels: [warningLabel] });

    // Poser le label review:override pour bloquer l'auto-fix
    const overrideLabel = 'review: override';
    if (!existingNames.includes(overrideLabel)) {
      await githubPost('labels', { name: overrideLabel, color: 'bfd4f2', description: 'Blocage de review outrepassé manuellement' });
    }
    if (!labelNames.includes(overrideLabel)) {
      await githubPost(`issues/${prNumber}/labels`, { labels: [overrideLabel] });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/override-review:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Review exceptions ────────────────────────────────────────────────────────
// Un commentaire GitHub dédié stocke les exceptions (bloquants downgradés en warning)
// Format : <!-- review-exceptions-v1 -->\n- [scope] texte du bullet\n...

const EXCEPTIONS_MARKER = '<!-- review-exceptions-v1 -->';

async function findExceptionsComment(prNumber) {
  const comments = await githubGet(`issues/${prNumber}/comments?per_page=100`);
  return (Array.isArray(comments) ? comments : []).find(c => c.body?.includes(EXCEPTIONS_MARKER)) ?? null;
}

router.get('/prs/:number/review-exceptions', async (req, res) => {
  try {
    const comment = await findExceptionsComment(req.params.number);
    if (!comment) return res.json({ exceptions: [] });
    // Parse lines starting with `- ` after the marker
    const lines = comment.body.split('\n').filter(l => l.startsWith('- '));
    res.json({ exceptions: lines.map(l => l.slice(2).trim()), commentId: comment.id });
  } catch (err) {
    console.error('[devhub] GET /prs/:number/review-exceptions:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/prs/:number/review-exceptions', async (req, res) => {
  try {
    const { exceptions } = req.body; // string[] — textes des bullets downgradés
    if (!Array.isArray(exceptions)) return res.status(400).json({ error: 'exceptions[] requis' });

    const date = new Date().toISOString().slice(0, 10);
    const lines = exceptions.map(e => `- ${e} *(downgraded: ${date})*`);
    const body = `${EXCEPTIONS_MARKER}\n**Problèmes volontairement downgradés en avertissement :**\n\n${lines.join('\n') || '_(aucun)_'}\n\n> Ces problèmes ne seront plus considérés comme bloquants lors des prochaines reviews.`;

    const existing = await findExceptionsComment(req.params.number);
    if (existing) {
      await githubPatch(`issues/comments/${existing.id}`, { body });
    } else {
      await githubPost(`issues/${req.params.number}/comments`, { body });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/review-exceptions:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /commits/:sha/files ──────────────────────────────────────────────────

router.get('/commits/:sha/files', async (req, res) => {
  try {
    const commit = await githubGet(`commits/${req.params.sha}`);
    res.json(commit.files || []);
  } catch (err) {
    console.error('[devhub] GET /commits/:sha/files:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /commits-files?shas=sha1,sha2,... ───────────────────────────────────
// Agrège les fichiers de plusieurs commits (tous les commits d'un run)
// Les additions/deletions sont sommées par filename

router.get('/commits-files', async (req, res) => {
  try {
    const shas = (req.query.shas || '').split(',').map(s => s.trim()).filter(Boolean);
    if (shas.length === 0) return res.json([]);

    // Limiter à 10 SHAs max pour éviter les abus
    const limited = shas.slice(0, 10);
    const allFiles = await Promise.all(limited.map(async sha => {
      try {
        const commit = await githubGet(`commits/${sha}`);
        return commit.files || [];
      } catch { return []; }
    }));

    // Agréger par filename : sommer additions et deletions
    const byFilename = new Map();
    for (const files of allFiles) {
      for (const f of files) {
        if (byFilename.has(f.filename)) {
          const existing = byFilename.get(f.filename);
          existing.additions += f.additions || 0;
          existing.deletions += f.deletions || 0;
          existing.changes   += f.changes   || 0;
        } else {
          byFilename.set(f.filename, { ...f });
        }
      }
    }

    res.json(Array.from(byFilename.values()));
  } catch (err) {
    console.error('[devhub] GET /commits-files:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /runs/:runId/jobs ────────────────────────────────────────────────────

router.get('/runs/:runId/jobs', async (req, res) => {
  try {
    const data = await githubGet(`actions/runs/${req.params.runId}/jobs`);
    res.json(data?.jobs || []);
  } catch (err) {
    console.error('[devhub] GET /runs/:runId/jobs:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /runs/:runId/commits ─────────────────────────────────────────────────
// Retourne les commits sauvegardés en DB pour ce run (stockés par le webhook)

router.get('/runs/:runId/commits', async (req, res) => {
  try {
    const runId = BigInt(req.params.runId);
    const commits = await prisma.githubRunCommit.findMany({
      where: { runId },
      orderBy: { committedAt: 'asc' },
    });
    res.json(commits);
  } catch (err) {
    console.error('[devhub] GET /runs/:runId/commits:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /runs/:runId/files ───────────────────────────────────────────────────
// Retourne les fichiers modifiés par les commits de ce run (depuis la DB + GitHub)

router.get('/runs/:runId/files', async (req, res) => {
  try {
    const runId = BigInt(req.params.runId);
    const commits = await prisma.githubRunCommit.findMany({
      where: { runId },
      orderBy: { committedAt: 'asc' },
    });

    if (commits.length === 0) return res.json([]);

    const shas = commits.map(c => c.sha).slice(0, 10);
    const allFiles = await Promise.all(shas.map(async sha => {
      try {
        const commit = await githubGet(`commits/${sha}`);
        return commit.files || [];
      } catch { return []; }
    }));

    const byFilename = new Map();
    for (const files of allFiles) {
      for (const f of files) {
        if (byFilename.has(f.filename)) {
          const existing = byFilename.get(f.filename);
          existing.additions += f.additions || 0;
          existing.deletions += f.deletions || 0;
          existing.changes   += f.changes   || 0;
        } else {
          byFilename.set(f.filename, { ...f });
        }
      }
    }

    res.json(Array.from(byFilename.values()));
  } catch (err) {
    console.error('[devhub] GET /runs/:runId/files:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});



router.get('/file-content', async (req, res) => {
  try {
    const { path, ref = 'master' } = req.query;
    if (!path) return res.status(400).json({ error: 'path requis' });
    const data = await githubGet(`contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    res.json({ content, sha: data.sha });
  } catch (err) {
    console.error('[devhub] GET /file-content:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── PUT /file-content ────────────────────────────────────────────────────────

router.put('/file-content', requireAdmin, async (req, res) => {
  try {
    const { path, content, branch = 'master', message = 'chore(spec): mise à jour via DevHub' } = req.body || {};
    if (!path || content === undefined) return res.status(400).json({ error: 'path et content requis' });
    // Récupérer le SHA actuel (obligatoire pour l'API GitHub)
    const existing = await githubGet(`contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`).catch(() => null);
    const sha = existing?.sha;
    const payload = { message, content: Buffer.from(content, 'utf-8').toString('base64'), branch };
    if (sha) payload.sha = sha;
    await githubPut(`contents/${encodeURIComponent(path)}`, payload);
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] PUT /file-content:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/close ───────────────────────────────────────────────

router.post('/issues/:number/close', async (req, res) => {
  try {
    const issueNumber = Number(req.params.number);
    await githubPatch(`issues/${issueNumber}`, { state: 'closed' });

    // Fermer la PR rattachée si elle existe et est encore ouverte
    try {
      const wf = await orchestrator.getOrCreate(issueNumber);
      if (wf.prNumber) {
        const pr = await githubGet(`pulls/${wf.prNumber}`);
        if (pr?.state === 'open') {
          await githubPatch(`pulls/${wf.prNumber}`, { state: 'closed' });
          console.log(`[devhub] PR #${wf.prNumber} fermée avec l'issue #${issueNumber}`);
        }
      }
      // Pauser l'orchestrateur pour stopper toute activité pipeline sur cette issue
      if (!['DEPLOYED', 'MERGED', 'PAUSED', 'IDLE'].includes(wf.state)) {
        await orchestrator.transition(wf, 'PAUSED');
        console.log(`[devhub] Issue #${issueNumber} fermée → orchestrateur passé en PAUSED`);
      }
    } catch (orchErr) {
      console.warn(`[devhub] Impossible de pauser l'orchestrateur pour issue #${issueNumber}:`, orchErr.message);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /issues/:number/close:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/merge ──────────────────────────────────────────────────

router.post('/prs/:number/merge', async (req, res) => {
  try {
    const { mergeMethod = 'squash' } = req.body || {};
    const data = await githubPut(`pulls/${req.params.number}/merge`, { merge_method: mergeMethod });
    res.json(data);
  } catch (err) {
    console.error('[devhub] POST /prs/:number/merge:', err.message, err.data);
    const ghMessage = err.data?.message || err.message;
    res.status(err.status || 500).json({ error: ghMessage, details: err.data });
  }
});

// ─── POST /prs/:number/close ──────────────────────────────────────────────────

router.post('/prs/:number/close', async (req, res) => {
  try {
    await githubPatch(`pulls/${req.params.number}`, { state: 'closed' });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/close:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/trigger-agent ──────────────────────────────────────

router.post('/issues/:number/trigger-agent', async (req, res) => {
  try {
    const issueNumber = Number(req.params.number);
    const { workflow, aiModel = 'gpt-4.1', autoMode } = req.body || {};
    if (!workflow) return res.status(400).json({ error: 'workflow requis' });

    const workflowMap = {
      'product-spec-agent': 'product-spec-agent.yml',
      'feature-dev-agent': 'feature-dev-agent.yml',
    };
    const workflowFile = workflowMap[workflow] || workflow;

    await githubPost(`actions/workflows/${workflowFile}/dispatches`, {
      ref: 'master',
      inputs: {
        issue_number: String(issueNumber),
        ai_model: aiModel,
      },
    });

    // Mettre à jour l'état de l'orchestrateur
    const wf = await orchestrator.getOrCreate(issueNumber);
    const updates = {};
    if (autoMode !== undefined) updates.autoMode = autoMode;

    if (workflow === 'product-spec-agent') {
      await orchestrator.transition({ ...wf, ...updates }, 'SPEC_RUNNING', updates);
    } else if (workflow === 'feature-dev-agent') {
      await orchestrator.transition({ ...wf, ...updates }, 'DEV_RUNNING', updates);
    } else if (Object.keys(updates).length > 0) {
      await prisma.devHubWorkflow.update({ where: { issueNumber }, data: updates });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /issues/:number/trigger-agent:', err.message, err.data);
    res.status(err.status || 500).json({ error: err.message, detail: err.data });
  }
});

// ─── POST /prs/:number/deploy-preview ────────────────────────────────────────

router.post('/prs/:number/deploy-preview', async (req, res) => {
  try {
    const pr = await githubGet(`pulls/${req.params.number}`);
    const branch = pr.head?.ref;
    if (!branch) return res.status(400).json({ error: 'Branche introuvable pour cette PR' });

    await githubPost('actions/workflows/delivery-agent.yml/dispatches', {
      ref: 'master',
      inputs: { pr_number: String(req.params.number) },
    });
    res.json({ success: true, branch });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/deploy-preview:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /deploy-production ──────────────────────────────────────────────────

router.post('/deploy-production', async (req, res) => {
  try {
    const { commitMessage } = req.body || {};
    await githubPost('actions/workflows/deploy-production.yml/dispatches', {
      ref: 'master',
      inputs: commitMessage ? { commit_message: commitMessage } : {},
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /deploy-production:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/fix-commit-files ───────────────────────────────────────
// Lit le SHA du dernier commit du fix agent depuis les commentaires PR,
// puis retourne la liste des fichiers modifiés dans ce commit.
router.get('/prs/:number/fix-commit-files', async (req, res) => {
  try {
    const prNumber = req.params.number;
    // Lire les commentaires de la PR pour trouver le marqueur <!-- fix-commit-sha: {SHA} -->
    let sha = null;
    let page = 1;
    while (!sha) {
      const comments = await githubGet(`issues/${prNumber}/comments?per_page=100&page=${page}`);
      if (!Array.isArray(comments) || comments.length === 0) break;
      // Chercher dans les commentaires (du plus récent en lisant page par page)
      for (const c of [...comments].reverse()) {
        const match = c.body?.match(/<!--\s*fix-commit-sha:\s*([a-f0-9]{40})\s*-->/);
        if (match) { sha = match[1]; break; }
      }
      if (comments.length < 100) break;
      page++;
    }
    if (!sha) {
      return res.status(404).json({ error: 'Aucun commit fix trouvé sur cette PR', files: [] });
    }
    // Récupérer les fichiers du commit
    const commitData = await githubGet(`commits/${sha}`);
    const files = (commitData.files || []).map(f => f.filename);
    res.json({ sha, files });
  } catch (err) {
    console.error('[devhub] GET /prs/:number/fix-commit-files:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/trigger-reviews ───────────────────────────────────────

router.post('/prs/:number/trigger-reviews', async (req, res) => {
  try {
    const body = req.body || {};
    const review_model = body.review_model || body.reviewModel || 'gpt-4.1';
    const fix_model = body.fix_model || body.fixModel || 'deepseek-v4-flash';
    // filesFilter : liste de fichiers à transmettre aux agents via files_filter
    const filesFilter = Array.isArray(body.filesFilter) ? body.filesFilter.join(',') : (body.filesFilter || '');
    const pr = await githubGet(`pulls/${req.params.number}`);
    const branch = pr.head?.ref;
    if (!branch) return res.status(400).json({ error: 'Branche introuvable' });

    await githubPost('actions/workflows/code-reviews.yml/dispatches', {
      ref: 'master',
      inputs: {
        pr_number: String(req.params.number),
        review_model,
        fix_model,
        files_filter: filesFilter,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/trigger-reviews:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/fix-reviews ───────────────────────────────────────────

router.post('/prs/:number/fix-reviews', async (req, res) => {
  try {
    const { aiModel = 'deepseek-chat', issuesToFix } = req.body || {};
    const pr = await githubGet(`pulls/${req.params.number}`);
    const branch = pr.head?.ref;
    if (!branch) return res.status(400).json({ error: 'Branche introuvable' });

    await githubPost('actions/workflows/fix-reviews-agent.yml/dispatches', {
      ref: 'master',
      inputs: {
        pr_number: String(req.params.number),
        ai_model: aiModel,
        issues_to_fix: (issuesToFix && issuesToFix.length > 0) ? JSON.stringify(issuesToFix) : '',
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/fix-reviews:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/restore-from-commit ───────────────────────────────────
// Restaure des fichiers depuis un commit source sur la branche de la PR.
// Body: { commitSha: string, files: string[] }
// Pour chaque fichier : récupère le contenu au commitSha, puis le pousse sur la branche PR.

router.post('/prs/:number/restore-from-commit', requireAdmin, async (req, res) => {
  try {
    const { commitSha, files } = req.body || {};
    if (!commitSha || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'commitSha et files[] requis' });
    }

    const pr = await githubGet(`pulls/${req.params.number}`);
    const branch = pr.head?.ref;
    if (!branch) return res.status(400).json({ error: 'Branche PR introuvable' });

    const results = [];
    for (const filePath of files) {
      // 1. Contenu du fichier au commit source (base64)
      const sourceFile = await githubGet(`contents/${filePath}?ref=${commitSha}`);
      const contentBase64 = sourceFile.content.replace(/\n/g, '');

      // 2. SHA actuel du fichier sur la branche PR (pour l'update, peut être absent si fichier vide/supprimé)
      let currentSha = null;
      try {
        const currentFile = await githubGet(`contents/${filePath}?ref=${encodeURIComponent(branch)}`);
        currentSha = currentFile.sha;
      } catch (e) {
        if (e.status !== 404) throw e;
        // Fichier absent sur la branche → création
      }

      // Si le fichier est déjà identique (même SHA), pas besoin de PUT
      if (currentSha && currentSha === sourceFile.sha) {
        results.push({ file: filePath, status: 'already_up_to_date' });
        continue;
      }

      // 3. PUT /contents pour créer ou mettre à jour
      const body = {
        message: `restore: ${filePath} depuis commit ${commitSha.slice(0, 7)}`,
        content: contentBase64,
        branch,
        ...(currentSha ? { sha: currentSha } : {}),
      };
      await githubPut(`contents/${filePath}`, body);
      results.push({ file: filePath, status: 'restored' });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/restore-from-commit:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/report-bug ────────────────────────────────────────────
// Poste un commentaire [BUG-QA] sur la PR (sans déclencher le workflow)

router.post('/prs/:number/report-bug', async (req, res) => {
  try {
    const { bug_description, bug_category = 'other', ai_model = 'deepseek-v4-flash', screenshots = [] } = req.body || {};
    if (!bug_description?.trim()) return res.status(400).json({ error: 'bug_description requis' });

    // Upload des screenshots dans le repo sur la branche qa-screenshots
    const screenshotUrls = [];
    const safeScreenshots = Array.isArray(screenshots) ? screenshots.slice(0, 5) : [];

    if (safeScreenshots.length > 0) {
      // S'assurer que la branche qa-screenshots existe, sinon la créer depuis master
      const SCREENSHOTS_BRANCH = 'qa-screenshots';
      try {
        await githubGet(`git/ref/heads/${SCREENSHOTS_BRANCH}`);
      } catch {
        const masterRef = await githubGet('git/ref/heads/master');
        await githubPost('git/refs', { ref: `refs/heads/${SCREENSHOTS_BRANCH}`, sha: masterRef.object.sha });
      }

      for (let i = 0; i < safeScreenshots.length; i++) {
        const shot = safeScreenshots[i];
        if (!shot?.data) continue;
        const mimeType = shot.mimeType || 'image/png';
        const ext = (mimeType.includes('jpeg') || mimeType.includes('jpg')) ? 'jpg' : 'png';
        const timestamp = Date.now() + i;
        const filePath = `qa-screenshots/pr-${req.params.number}/${timestamp}-${i}.${ext}`;
        // Supprimer le préfixe data URI si présent
        const base64Content = shot.data.replace(/^data:image\/[a-z+]+;base64,/, '');
        await githubPut(`contents/${filePath}`, {
          message: `qa: screenshot PR #${req.params.number}`,
          content: base64Content,
          branch: SCREENSHOTS_BRANCH,
        });
        screenshotUrls.push(`https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${SCREENSHOTS_BRANCH}/${filePath}`);
      }
    }

    let screenshotsSection = '';
    if (screenshotUrls.length > 0) {
      screenshotsSection = '\n\n#### 📸 Screenshots\n\n' + screenshotUrls.map((url, i) => `![screenshot-${i + 1}](${url})`).join('\n\n');
    }

    const body = `### [BUG-QA] ${bug_category}\n\n${bug_description.trim()}${screenshotsSection}\n\n<!-- qa-bug ai_model:${ai_model} -->`;
    await githubPost(`issues/${req.params.number}/comments`, { body });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/report-bug:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /prs/:number/qa-bugs ─────────────────────────────────────────────────
// Retourne la liste des bugs reportés sur la PR (commentaires [BUG-QA])

router.get('/prs/:number/qa-bugs', async (req, res) => {
  try {
    const comments = await githubGet(`issues/${req.params.number}/comments?per_page=100`);
    const bugs = (Array.isArray(comments) ? comments : [])
      .filter(c => c.body?.includes('[BUG-QA]'))
      .map(c => ({
        id: c.id,
        url: c.html_url,
        created_at: c.created_at,
        category: c.body.match(/### \[BUG-QA\] (\S+)/)?.[1] || 'other',
        description: c.body
          .replace(/^### \[BUG-QA\] \S+\n\n/, '')
          .replace(/\n\n<!-- qa-bug .* -->$/, '')
          .trim(),
        ai_model: c.body.match(/<!-- qa-bug ai_model:(\S+) -->/)?.[1] || 'deepseek-v4-flash',
      }));
    res.json(bugs);
  } catch (err) {
    console.error('[devhub] GET /prs/:number/qa-bugs:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /prs/:number/report-qa-bug ─────────────────────────────────────────

router.post('/prs/:number/report-qa-bug', async (req, res) => {
  try {
    const { bug_description, bug_category = 'functional_bug', ai_model = 'claude-sonnet-4-6' } = req.body || {};
    if (!bug_description) return res.status(400).json({ error: 'bug_description requis' });

    const pr = await githubGet(`pulls/${req.params.number}`);
    const branch = pr.head?.ref;
    if (!branch) return res.status(400).json({ error: 'Branche introuvable' });

    await githubPost('actions/workflows/qa-report.yml/dispatches', {
      ref: 'master',
      inputs: {
        pr_number: String(req.params.number),
        bug_description,
        bug_category,
        ai_model,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /prs/:number/report-qa-bug:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/feedback-to-dev ────────────────────────────────────
// Poste un commentaire de feedback sur la PR associée et relance le feature-dev agent

router.post('/issues/:number/feedback-to-dev', async (req, res) => {
  try {
    const { feedback, aiModel = 'gpt-4.1', prNumber } = req.body || {};
    if (!feedback?.trim()) return res.status(400).json({ error: 'feedback requis' });

    // Poster un commentaire sur la PR (ou l'issue si pas de PR)
    const commentBody = `## 🔄 Feedback — Retour vers Dev\n\n${feedback}\n\n---\n*Envoyé depuis le Dev Hub — le feature-dev agent va être relancé.*`;

    if (prNumber) {
      // Commentaire sur la PR
      await githubPost(`issues/${prNumber}/comments`, { body: commentBody });
    } else {
      // Commentaire sur l'issue
      await githubPost(`issues/${req.params.number}/comments`, { body: commentBody });
    }

    // Relancer le feature-dev agent avec le feedback
    await githubPost('actions/workflows/feature-dev-agent.yml/dispatches', {
      ref: 'master',
      inputs: {
        issue_number: String(req.params.number),
        ai_model: aiModel,
        feedback: feedback.trim(),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[devhub] POST /issues/:number/feedback-to-dev:', err.message, err.data);
    res.status(err.status || 500).json({ error: err.message, detail: err.data });
  }
});

// ─── POST /spec-chat ──────────────────────────────────────────────────────────

router.post('/spec-chat', async (req, res) => {
  try {
    const { messages = [], specContent = '', issueTitle = '', issueBody = '', aiModel = 'deepseek-v4-flash' } = req.body || {};

    const systemPrompt = `Tu es un assistant expert en développement pour l'application Mon Petit Roadtrip, une application mobile et web de planification de road trips.

Tu aides à raffiner les spécifications fonctionnelles d'une feature avant implémentation.

${issueTitle ? `Issue : ${issueTitle}` : ''}
${issueBody ? `\nDescription de l'issue :\n${issueBody}` : ''}
${specContent ? `\nSpécification actuelle :\n\n${specContent}` : ''}

Tu réponds en JSON avec le format : { "reply": "ta réponse en markdown", "proposedContent": "contenu spec amélioré si applicable, sinon null" }

Si tu améliores la spec, inclus le contenu complet du fichier spec.md mis à jour dans proposedContent.`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let raw;

    if (aiModel.startsWith('claude-')) {
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
      if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });
      const { status, data } = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({ model: aiModel, max_tokens: 4000, system: systemPrompt, messages: messages.map(m => ({ role: m.role, content: m.content })) });
        const r = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (resp) => {
          let d = ''; resp.on('data', c => (d += c)); resp.on('end', () => resolve({ status: resp.statusCode, data: JSON.parse(d) }));
        });
        r.on('error', reject); r.write(payload); r.end();
      });
      if (status >= 400) return res.status(status).json({ error: data?.error?.message || 'Erreur Anthropic' });
      raw = data?.content?.[0]?.text || '{}';
    } else if (aiModel.includes('deepseek')) {
      const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
      if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY non configuré' });
      const { status, data } = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({ model: aiModel, max_tokens: 4000, messages: chatMessages });
        const r = https.request({ hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST', headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (resp) => {
          let d = ''; resp.on('data', c => (d += c)); resp.on('end', () => resolve({ status: resp.statusCode, data: JSON.parse(d) }));
        });
        r.on('error', reject); r.write(payload); r.end();
      });
      if (status >= 400) return res.status(status).json({ error: data?.error?.message || 'Erreur DeepSeek' });
      raw = data?.choices?.[0]?.message?.content || '{}';
    } else {
      if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY non configuré' });
      const { status, data } = await openAIFetch({ model: aiModel, messages: chatMessages, max_tokens: 4000, response_format: { type: 'json_object' } });
      if (status >= 400) return res.status(status).json({ error: data?.error?.message || 'Erreur OpenAI' });
      raw = data?.choices?.[0]?.message?.content || '{}';
    }

    // Extraire le JSON (DeepSeek/Anthropic peuvent wrapper dans des fences)
    const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    try {
      res.json(JSON.parse(cleaned));
    } catch {
      res.json({ reply: raw, proposedContent: null });
    }
  } catch (err) {
    console.error('[devhub] POST /spec-chat:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ORCHESTRATEUR ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /issues/:number/workflow ─────────────────────────────────────────────
// Retourne l'état du workflow pour une issue

router.get('/issues/:number/workflow', requireAdmin, async (req, res) => {
  try {
    const wf = await orchestrator.getOrCreate(Number(req.params.number));
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/workflow ────────────────────────────────────────────
// Crée ou met à jour le workflow (autoMode, prNumber, state initial)

router.post('/issues/:number/workflow', requireAdmin, async (req, res) => {
  try {
    const issueNumber = Number(req.params.number);
    const { autoMode, prNumber, state } = req.body || {};
    const wf = await orchestrator.getOrCreate(issueNumber);

    const updates = {};
    if (autoMode !== undefined) updates.autoMode = autoMode;
    if (prNumber  !== undefined) updates.prNumber  = prNumber;
    if (state && orchestrator.ALLOWED_TRANSITIONS[wf.state]?.includes(state)) {
      updates.state = state;
      updates.lastTransitionAt = new Date();
    }

    const updated = await prisma.devHubWorkflow.update({
      where: { issueNumber },
      data: updates,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/workflow/tick ───────────────────────────────────────
// Déclenche une évaluation manuelle du workflow

router.post('/issues/:number/workflow/tick', requireAdmin, async (req, res) => {
  try {
    const wf = await orchestrator.tick(Number(req.params.number));
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/workflow/unstuck ────────────────────────────────────
// Débloque manuellement un workflow STUCK

router.post('/issues/:number/workflow/unstuck', requireAdmin, async (req, res) => {
  try {
    const issueNumber = Number(req.params.number);
    const { state = 'REVIEW_PENDING' } = req.body || {};
    const wf = await orchestrator.getOrCreate(issueNumber);
    await orchestrator.unlock(issueNumber);
    const updated = await prisma.devHubWorkflow.update({
      where: { issueNumber },
      data: {
        state,
        stuckReason: null,
        retryCount: 0,
        lockedUntil: null,
        lastTransitionAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /issues/:number/workflow/pause ─────────────────────────────────────
// Met en pause ou reprend le workflow

router.post('/issues/:number/workflow/pause', requireAdmin, async (req, res) => {
  try {
    const issueNumber = Number(req.params.number);
    const { paused } = req.body || {};
    const wf = await orchestrator.getOrCreate(issueNumber);
    const newState = paused ? 'PAUSED' : 'IDLE';
    const updated = await orchestrator.transition(wf, newState);
    res.json(updated || wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /workflow/all ────────────────────────────────────────────────────────
// Retourne tous les workflows actifs

router.get('/workflow/all', requireAdmin, async (req, res) => {
  try {
    const all = await prisma.devHubWorkflow.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cron interne — tick toutes les 2 minutes ─────────────────────────────────
const CRON_INTERVAL_MS = 10 * 1000;
setInterval(async () => {
  try { await orchestrator.tickAll(); }
  catch (err) { console.error('[orchestrator] Erreur cron :', err.message); }
}, CRON_INTERVAL_MS);
console.log(`[orchestrator] ✅ Cron démarré — intervalle ${CRON_INTERVAL_MS / 1000}s`);

// ─── SSE — GET /events ────────────────────────────────────────────────────────
// Connexion persistante Server-Sent Events pour les mises à jour temps réel.
// Le webhook appelle sseBus.notify() après chaque event GitHub significatif.

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // désactive le buffering nginx
  res.flushHeaders();

  sseBus.addClient(res);
  console.log(`[SSE] Client connecté — total: ${sseBus.clientCount()}`);

  // Heartbeat toutes les 25s pour maintenir la connexion
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { /* connexion fermée */ }
  }, 25_000);

  req.on('close', () => {
    sseBus.removeClient(res);
    clearInterval(heartbeat);
    console.log('[SSE] Client déconnecté');
  });
});

module.exports = router;
