/**
 * Backfill initial : charge tous les runs GitHub existants dans la table github_runs.
 * À exécuter une seule fois depuis le backend local (ou sur CT111 via `node scripts/backfill-runs.js`).
 *
 * Usage :
 *   cd backend && node scripts/backfill-runs.js
 */

require('dotenv').config();
const https = require('https');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'mxh77';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'MonPetitRoadtrip';
const GITHUB_PAT   = process.env.GITHUB_PAT   || '';

function githubFetch(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MonPetitRoadtrip-Backfill/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAllPages(basePath, maxPages = 10) {
  const sep = basePath.includes('?') ? '&' : '?';
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await githubFetch(`${basePath}${sep}per_page=100&page=${page}`);
    const items = Array.isArray(data) ? data : (data?.workflow_runs ?? []);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function upsertRun(run) {
  if (!run?.id) return;
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
    },
  });
}

const WORKFLOWS = [
  'product-spec-agent.yml',
  'feature-dev-agent.yml',
  'code-reviews.yml',
  'delivery-agent.yml',
  'fix-reviews-agent.yml',
  'qa-report.yml',
];

async function main() {
  let total = 0;
  for (const wf of WORKFLOWS) {
    console.log(`→ Fetch ${wf}...`);
    const runs = await getAllPages(`actions/workflows/${wf}/runs`);
    console.log(`  ${runs.length} runs récupérés`);
    for (const run of runs) {
      await upsertRun(run);
    }
    total += runs.length;
  }
  console.log(`\n✅ Backfill terminé — ${total} runs insérés/mis à jour`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Erreur backfill:', err.message);
  process.exit(1);
});
