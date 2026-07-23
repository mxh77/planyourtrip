const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const names = ['Shampooing','Deocreme','Savon ânesse','Déodorant','Brosses à dents','Dentifrice','Coton tige'];

async function main() {
  const found = await p.todoItem.findMany({ where: { text: { in: names } }, select: { text: true, category: true } });
  if (found.length === 0) {
    console.log('Aucun de ces items trouvé dans la base');
  } else {
    found.forEach(i => console.log(i.text, '→', i.category));
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
