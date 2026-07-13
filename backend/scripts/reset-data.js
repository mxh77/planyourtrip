/**
 * Script de reset des données — supprime tout dans Supabase
 * Usage : node backend/scripts/reset-data.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🗑  Suppression des données Supabase...');

  const [activities, accommodations, steps, roadtrips] = await prisma.$transaction([
    prisma.activity.deleteMany(),
    prisma.accommodation.deleteMany(),
    prisma.step.deleteMany(),
    prisma.roadtrip.deleteMany(),
  ]);

  console.log(`  ✓ ${activities.count} activités supprimées`);
  console.log(`  ✓ ${accommodations.count} hébergements supprimés`);
  console.log(`  ✓ ${steps.count} étapes supprimées`);
  console.log(`  ✓ ${roadtrips.count} roadtrips supprimés`);
  console.log('✅ Supabase vidé.');
}

main()
  .catch((e) => { console.error('❌ Erreur :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
