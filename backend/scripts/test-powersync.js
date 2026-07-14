#!/usr/bin/env node
/**
 * Script pour tester la connexion PowerSync et les sync rules
 */

require('dotenv').config({ path: '.env' });
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function testPowerSync() {
  console.log('\n=== PowerSync Diagnostic ===\n');

  // 1. Vérifier les variables d'environnement
  console.log('1️⃣  Environnement:');
  console.log('   POWERSYNC_URL:', process.env.POWERSYNC_URL);
  console.log('   POWERSYNC_JWT_SECRET:', process.env.POWERSYNC_JWT_SECRET?.substring(0, 20) + '...');
  console.log('   POWERSYNC_JWT_KID:', process.env.POWERSYNC_JWT_KID);

  if (!process.env.POWERSYNC_URL || !process.env.POWERSYNC_JWT_SECRET) {
    console.error('\n❌ Variables PowerSync manquantes!');
    process.exit(1);
  }

  // 2. Générer un token JWT de test
  console.log('\n2️⃣  Génération du token JWT:');
  const psSecret = Buffer.from(process.env.POWERSYNC_JWT_SECRET, 'base64url');
  const testToken = jwt.sign(
    {
      sub: 'test-user-id',
      user_id: 'test-user-id',
      iat: Math.floor(Date.now() / 1000),
    },
    psSecret,
    {
      expiresIn: '1h',
      audience: process.env.POWERSYNC_URL,
      keyid: process.env.POWERSYNC_JWT_KID,
    }
  );

  console.log('   ✓ Token généré');
  console.log('   Payload:', jwt.decode(testToken));

  // 3. Tester la connexion à PowerSync
  console.log('\n3️⃣  Test de connexion à PowerSync:');
  try {
    // Essayer de récupérer les status de PowerSync
    const testUrl = process.env.POWERSYNC_URL.replace('powersync.journeyapps.com', '');
    const res = await fetch(`${process.env.POWERSYNC_URL}/health`, {
      headers: { 
        'Authorization': `Bearer ${testToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('   Status:', res.status, res.statusText);
    if (res.ok) {
      const data = await res.json();
      console.log('   Data:', data);
    }
  } catch (error) {
    console.warn('   ⚠️  Health check failed:', error.message);
  }

  // 4. Vérifier les sync rules
  console.log('\n4️⃣  Sync Rules:');
  const fs = require('fs');
  const path = require('path');
  const rulesPath = path.join(__dirname, '../sync_rules.yaml');
  if (fs.existsSync(rulesPath)) {
    const rules = fs.readFileSync(rulesPath, 'utf-8');
    console.log('   ✓ sync_rules.yaml trouvé');
    console.log('   Buckets:', rules.match(/^  \w+:/gm)?.map(b => b.trim().replace(':', '')) || []);
  } else {
    console.warn('   ⚠️  sync_rules.yaml non trouvé');
  }

  console.log('\n✅ Diagnostic terminé\n');
}

testPowerSync().catch(console.error);
