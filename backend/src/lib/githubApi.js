/**
 * Helpers GitHub API partagés entre devhub.js et devhubWebhook.js
 */
const https = require('https');

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'mxh77';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'MonPetitRoadtrip';
const GITHUB_PAT   = process.env.GITHUB_PAT   || '';

function githubFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url    = new URL(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`);
    const method = options.method || 'GET';
    const body   = options.body ? JSON.stringify(options.body) : null;

    const reqOptions = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
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
    err.data   = data;
    throw err;
  }
  return data;
}

async function githubPost(path, body) {
  const { status, data } = await githubFetch(path, { method: 'POST', body });
  if (status >= 400) {
    const err = new Error(`GitHub POST ${path} → ${status}`);
    err.status = status;
    err.data   = data;
    throw err;
  }
  return data;
}

async function githubPatch(path, body) {
  const { status, data } = await githubFetch(path, { method: 'PATCH', body });
  if (status >= 400) {
    const err = new Error(`GitHub PATCH ${path} → ${status}`);
    err.status = status;
    err.data   = data;
    throw err;
  }
  return data;
}

async function githubPut(path, body) {
  const { status, data } = await githubFetch(path, { method: 'PUT', body });
  if (status >= 400) {
    const err = new Error(`GitHub PUT ${path} → ${status}`);
    err.status = status;
    err.data   = data;
    throw err;
  }
  return data;
}

async function githubDelete(path) {
  const { status, data } = await githubFetch(path, { method: 'DELETE' });
  if (status >= 400 && status !== 404) {
    const err = new Error(`GitHub DELETE ${path} → ${status}`);
    err.status = status;
    err.data   = data;
    throw err;
  }
  return data;
}

async function githubGetAllPages(basePath, maxPages = 5) {
  const separator = basePath.includes('?') ? '&' : '?';
  const allItems  = [];
  for (let page = 1; page <= maxPages; page++) {
    const data  = await githubGet(`${basePath}${separator}per_page=100&page=${page}`);
    const items = Array.isArray(data) ? data : (data?.workflow_runs ?? []);
    allItems.push(...items);
    if (items.length < 100) break;
  }
  return allItems;
}

module.exports = { githubFetch, githubGet, githubPost, githubPatch, githubPut, githubDelete, githubGetAllPages };
