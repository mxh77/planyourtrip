/**
 * Keep-alive PowerSync + Backend
 * Fait un appel authentifié à PowerSync toutes les heures via cron pour éviter
 * la suspension automatique du free tier PowerSync Cloud.
 *
 * Installation sur CT 111 :
 *   node /opt/MonPetitRoadtrip/backend/scripts/keepalive.js
 *
 * Cron (crontab -e sur CT 111) :
 *   0 * * * * node /opt/MonPetitRoadtrip/backend/scripts/keepalive.js >> /var/log/mpr-keepalive.log 2>&1
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const http = require('http');
const jwt = require('jsonwebtoken');

const POWERSYNC_URL = process.env.POWERSYNC_URL;
const BACKEND_URL = `http://localhost:${process.env.PORT || 3111}/health`;

// Génère un JWT PowerSync valide (même logique que /api/auth/powersync-token)
function makePowerSyncToken() {
  const psSecret = Buffer.from(process.env.POWERSYNC_JWT_SECRET, 'base64url');
  return jwt.sign(
    { sub: 'keepalive', user_id: 'keepalive', iat: Math.floor(Date.now() / 1000) },
    psSecret,
    { expiresIn: '5m', audience: POWERSYNC_URL, keyid: process.env.POWERSYNC_JWT_KID }
  );
}

function pingHttp(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      resolve({ url, status: res.statusCode, ok: res.statusCode < 400 });
    });
    req.on('error', (e) => resolve({ url, status: null, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: null, ok: false, error: 'timeout' }); });
  });
}

// Appel authentifié GET /sync/stream — endpoint que PowerSync logue comme activité réelle
function pingPowerSync() {
  const token = makePowerSyncToken();
  const url = new URL(`${POWERSYNC_URL}/sync/stream`);

  return new Promise((resolve) => {
    const body = JSON.stringify({ buckets: [] });
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      // Drainer la réponse pour éviter de bloquer le socket
      res.resume();
      // Tout code HTTP (y compris 400/404) = service actif et requête reçue
      resolve({ url: `${POWERSYNC_URL}/sync/stream`, status: res.statusCode, ok: res.statusCode != null });
    });

    req.on('error', (e) => resolve({ url: `${POWERSYNC_URL}/sync/stream`, status: null, ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ url: `${POWERSYNC_URL}/sync/stream`, status: null, ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const now = new Date().toISOString();
  const results = await Promise.all([
    pingPowerSync(),
    pingHttp(BACKEND_URL),
  ]);

  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const detail = r.error ? ` (${r.error})` : ` → HTTP ${r.status}`;
    console.log(`[${now}] ${icon} ${r.url}${detail}`);
  }

  const allOk = results.every(r => r.ok);
  process.exit(allOk ? 0 : 1);
}

main();
