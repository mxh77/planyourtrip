const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const items = ['Shampooing','Deocreme','Savon ânesse','Déodorant','Brosses à dents','Dentifrice','Coton tige'];

async function main() {
  for (const text of items) {
    const item = await p.todoItem.findFirst({ where: { text, category: 'sante' } });
    if (item) {
      await p.todoItem.update({ where: { id: item.id }, data: { category: 'hygiene' } });
      console.log('✅', text, 'santé → hygiène');
    } else {
      console.log('⚠', text, 'non trouvé dans santé');
    }
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
