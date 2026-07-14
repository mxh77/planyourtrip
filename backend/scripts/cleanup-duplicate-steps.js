require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/lib/prisma.js');

async function main() {
  const roadtripId = 'cmrkqs15i003hlzzskswl8d2b'; // À adapter si besoin
  
  console.log('🔍 Cherche les étapes "Nouvelle étape" du roadtrip', roadtripId);
  
  const duplicates = await prisma.step.findMany({
    where: {
      roadtripId,
      name: 'Nouvelle étape',
    },
  });
  
  console.log(`✓ Trouvé ${duplicates.length} étapes à supprimer:`);
  duplicates.forEach(s => {
    console.log(`  - ${s.id} (order: ${s.order})`);
  });
  
  if (duplicates.length === 0) {
    console.log('✓ Rien à supprimer');
    process.exit(0);
  }
  
  // Supprimer
  const deleted = await prisma.step.deleteMany({
    where: {
      roadtripId,
      name: 'Nouvelle étape',
    },
  });
  
  console.log(`\n✅ ${deleted.count} étapes supprimées`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
