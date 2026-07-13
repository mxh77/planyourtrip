/**
 * Script de sauvegarde de la base de données
 * Exporte toutes les tables dans un fichier JSON horodaté
 *
 * Usage :
 *   node backup.js
 *   node backup.js --output ./mon-backup.json
 */
const path = require('path');
const BACKEND_MODULES = path.join(__dirname, 'backend/node_modules');

require(path.join(BACKEND_MODULES, 'dotenv')).config({ path: path.join(__dirname, 'backend/.env') });
const { PrismaClient } = require(path.join(BACKEND_MODULES, '@prisma/client'));
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const outputArg = process.argv.indexOf('--output');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultPath = path.join(__dirname, 'backups', `backup_${timestamp}.json`);
  const outputPath = outputArg !== -1 ? process.argv[outputArg + 1] : defaultPath;

  // Créer le dossier de destination si besoin
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log('📦 Démarrage de la sauvegarde...');

  const [
    users,
    roadtrips,
    roadtripMembers,
    steps,
    accommodations,
    activities,
    photos,
    betaFeedbacks,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.roadtrip.findMany(),
    prisma.roadtripMember.findMany(),
    prisma.step.findMany(),
    prisma.accommodation.findMany(),
    prisma.activity.findMany(),
    prisma.photo.findMany(),
    prisma.betaFeedback.findMany(),
  ]);

  const backup = {
    meta: {
      createdAt: new Date().toISOString(),
      version: '1.0',
      tables: {
        users: users.length,
        roadtrips: roadtrips.length,
        roadtripMembers: roadtripMembers.length,
        steps: steps.length,
        accommodations: accommodations.length,
        activities: activities.length,
        photos: photos.length,
        betaFeedbacks: betaFeedbacks.length,
      },
    },
    users,
    roadtrips,
    roadtripMembers,
    steps,
    accommodations,
    activities,
    photos,
    betaFeedbacks,
  };

  fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf-8');

  const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);

  console.log('✅ Sauvegarde terminée');
  console.log(`   📁 Fichier : ${outputPath}`);
  console.log(`   📊 Taille  : ${sizeKb} Ko`);
  console.log('   📋 Tables  :');
  Object.entries(backup.meta.tables).forEach(([table, count]) => {
    console.log(`      ${table.padEnd(20)} ${count} enregistrement(s)`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors de la sauvegarde :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
