/**
 * Liste les suggestions en attente (type=SUGGESTION, isHandled=false)
 * Usage : node scripts/list-suggestions.js
 * Usage (mark handled) : node scripts/list-suggestions.js --mark <id>
 */
require('dotenv').config();
const prisma = require('../src/lib/prisma');

async function main() {
  const args = process.argv.slice(2);

  // --mark <id> : marquer une suggestion comme traitée
  if (args[0] === '--mark' && args[1]) {
    const updated = await prisma.betaFeedback.update({
      where: { id: args[1] },
      data: { isHandled: true, handledAt: new Date() },
      include: { user: { select: { email: true } } },
    });
    console.log(`✅ Suggestion marquée comme traitée : ${updated.id}`);
    console.log(`   Texte : ${updated.text}`);
    console.log(`   Par   : ${updated.user.email}`);
    return;
  }

  // Lister les suggestions en attente
  const rows = await prisma.betaFeedback.findMany({
    where: { type: 'SUGGESTION', isHandled: false },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (rows.length === 0) {
    console.log('Aucune suggestion en attente.');
    return;
  }

  const PAD_ID = 26;
  const PAD_DATE = 12;
  const PAD_EMAIL = 28;

  console.log('\n📋 Suggestions en attente\n');
  console.log(' # │ ID                           │ Date       │ Utilisateur                 │ Suggestion');
  console.log('───┼──────────────────────────────┼────────────┼─────────────────────────────┼──────────────────────────────────────────');

  rows.forEach((r, i) => {
    const num = String(i + 1).padStart(2);
    const id = r.id.padEnd(PAD_ID);
    const date = r.createdAt.toISOString().slice(0, 10).padEnd(PAD_DATE);
    const email = (r.user.email ?? '').padEnd(PAD_EMAIL);
    const text = r.text.replace(/\n/g, ' ').slice(0, 80);
    console.log(` ${num} │ ${id} │ ${date} │ ${email} │ ${text}`);
  });
  console.log(`\n${rows.length} suggestion(s) en attente.\n`);
}

main().catch(e => {
  console.error('Erreur :', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
