#!/usr/bin/env node
/**
 * Script pour supprimer les roadtrips Europe en double,
 * en conservant uniquement celui de maxime.heron@gmail.com
 *
 * Usage: node scripts/delete-excess-europe-roadtrips.js
 */

require('dotenv').config({ path: '.env' });

const prisma = require('../src/lib/prisma');

async function main() {
  try {
    // 1. Trouver l'utilisateur cible
    const targetUser = await prisma.user.findUnique({
      where: { email: 'maxime.heron@gmail.com' },
    });

    if (!targetUser) {
      console.log('❌ Utilisateur maxime.heron@gmail.com introuvable');
      return;
    }

    console.log(`✓ Utilisateur cible : ${targetUser.email} (ID: ${targetUser.id})`);

    // 2. Trouver tous les roadtrips "Europe"
    const europeRoadtrips = await prisma.roadtrip.findMany({
      where: { title: 'Europe' },
      include: { user: { select: { email: true, id: true } } },
    });

    if (europeRoadtrips.length === 0) {
      console.log('Aucun roadtrip "Europe" trouvé en base.');
      return;
    }

    console.log(`\n📋 Roadtrips "Europe" trouvés : ${europeRoadtrips.length}`);
    for (const rt of europeRoadtrips) {
      const stepCount = await prisma.step.count({ where: { roadtripId: rt.id } });
      console.log(`  - ${rt.id} | ${rt.user.email} | ${stepCount} étapes | créé le ${rt.createdAt}`);
    }

    // 3. Filtrer : supprimer ceux qui ne sont PAS à maxime.heron@gmail.com
    const toDelete = europeRoadtrips.filter((rt) => rt.userId !== targetUser.id);

    if (toDelete.length === 0) {
      console.log('\n✅ Aucun roadtrip Europe à supprimer (seul celui de maxime.heron@gmail.com existe).');
      return;
    }

    console.log(`\n🗑️  Suppression de ${toDelete.length} roadtrip(s) Europe...`);

    for (const rt of toDelete) {
      console.log(`\n  Suppression du roadtrip ${rt.id} (utilisateur: ${rt.user.email})...`);

      // Supprimer les étapes liées (et leurs accommodations/activités en cascade)
      const steps = await prisma.step.findMany({
        where: { roadtripId: rt.id },
        select: { id: true },
      });
      const stepIds = steps.map((s) => s.id);

      if (stepIds.length > 0) {
        // Supprimer les accommodations liées aux steps
        const delAccom = await prisma.accommodation.deleteMany({
          where: { stepId: { in: stepIds } },
        });
        console.log(`    - ${delAccom.count} hébergement(s) supprimé(s)`);

        // Supprimer les activités liées aux steps
        const delActivities = await prisma.activity.deleteMany({
          where: { stepId: { in: stepIds } },
        });
        console.log(`    - ${delActivities.count} activité(s) supprimée(s)`);

        // Supprimer les photos liées aux steps
        const delPhotos = await prisma.photo.deleteMany({
          where: { stepId: { in: stepIds } },
        });
        console.log(`    - ${delPhotos.count} photo(s) supprimée(s)`);
      }

      // Supprimer les steps
      const delSteps = await prisma.step.deleteMany({
        where: { roadtripId: rt.id },
      });
      console.log(`    - ${delSteps.count} étape(s) supprimée(s)`);

      // Supprimer les membres du roadtrip
      const delMembers = await prisma.roadtripMember.deleteMany({
        where: { roadtripId: rt.id },
      });
      console.log(`    - ${delMembers.count} membre(s) supprimé(s)`);

      // Supprimer le roadtrip
      await prisma.roadtrip.delete({ where: { id: rt.id } });
      console.log(`    ✓ Roadtrip supprimé`);
    }

    // 4. Vérification finale
    const remaining = await prisma.roadtrip.findMany({
      where: { title: 'Europe' },
      include: { user: { select: { email: true } } },
    });

    console.log(`\n✅ Terminé. Roadtrips "Europe" restants : ${remaining.length}`);
    for (const rt of remaining) {
      const stepCount = await prisma.step.count({ where: { roadtripId: rt.id } });
      console.log(`  - ${rt.id} | ${rt.user.email} | ${stepCount} étapes`);
    }
  } catch (err) {
    console.error('Erreur :', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();