#!/usr/bin/env node
/**
 * Script pour importer le roadtrip Europe depuis Europe.json
 * Usage: node scripts/import-europe.js
 */

require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const prisma = require('../src/lib/prisma');

async function main() {
  try {
    // Lire le fichier Europe.json
    const dataPath = path.join(__dirname, '../../Europe.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // Créer pour tous les utilisateurs (ou au minimum pour les utilisateurs principaux)
    const users = await prisma.user.findMany();
    
    if (users.length === 0) {
      console.log('Aucun utilisateur trouvé en base');
      return;
    }

    console.log(`Création du roadtrip Europe pour ${users.length} utilisateur(s)...\n`);

    for (const testUser of users) {
      console.log(`\n=== Utilisateur: ${testUser.email} ===`);

      // Vérifier si le roadtrip existe déjà
      let roadtrip = await prisma.roadtrip.findFirst({
        where: {
          title: data.name,
          userId: testUser.id,
        },
      });

      if (roadtrip) {
        console.log('Roadtrip "Europe" trouvé, suppression des données existantes...');
        await prisma.step.deleteMany({
          where: { roadtripId: roadtrip.id },
        });
        await prisma.roadtrip.delete({
          where: { id: roadtrip.id },
        });
      }

      // Créer le roadtrip
      const waypoints = data.waypoints || [];
      const startDate = waypoints[0]?.checkin ? new Date(waypoints[0].checkin) : null;
      const endDate = waypoints[waypoints.length - 1]?.checkout ? new Date(waypoints[waypoints.length - 1].checkout) : null;

      roadtrip = await prisma.roadtrip.create({
        data: {
          title: data.name,
          startDate,
          endDate,
          userId: testUser.id,
          status: 'PLANNED',
        },
      });

      console.log(`✓ Roadtrip créé: ${roadtrip.title} (ID: ${roadtrip.id})`);

      // Créer les steps depuis les waypoints
      let totalDistance = 0;
      const stepsData = [];

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const prevWp = i > 0 ? waypoints[i - 1] : null;

        // Calculer la distance depuis l'étape précédente (approximation)
        let distanceFromPrev = 0;
        let durationFromPrev = 0;
        if (prevWp && i > 1) {
          // Utiliser Haversine ou une valeur estimée
          const earth_r = 6371; // km
          const lat1 = (prevWp.lat * Math.PI) / 180;
          const lat2 = (wp.lat * Math.PI) / 180;
          const dLat = ((wp.lat - prevWp.lat) * Math.PI) / 180;
          const dLng = ((wp.lng - prevWp.lng) * Math.PI) / 180;

          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceFromPrev = Math.round(earth_r * c); // km
          durationFromPrev = Math.round((distanceFromPrev * 60) / 90); // Estime 90km/h
          totalDistance += distanceFromPrev;
        }

        // Créer le step
        const step = await prisma.step.create({
          data: {
            name: wp.name,
            location: wp.address,
            latitude: wp.lat,
            longitude: wp.lng,
            startDate: wp.checkin ? new Date(wp.checkin) : null,
            endDate: wp.checkout ? new Date(wp.checkout) : null,
            arrivalTime: wp.arrivalTime || null,
            departureTime: wp.departureTime || null,
            order: i,
            routeDistanceMeters: distanceFromPrev * 1000, // Convertir en mètres
            routeDurationSeconds: durationFromPrev * 60, // Convertir en secondes
            notes: wp.notes,
            roadtripId: roadtrip.id,
            userId: testUser.id,
          },
        });

        // Créer l'accommodation si sélectionnée
        if (wp.selectedCamping) {
          const camping = wp.selectedCamping;
          const accom = await prisma.accommodation.create({
            data: {
              type: 'CAMPING',
              name: camping.name,
              address: camping.address,
              latitude: camping.lat,
              longitude: camping.lng,
              checkIn: wp.checkin ? new Date(wp.checkin) : null,
              checkOut: wp.checkout ? new Date(wp.checkout) : null,
              bookingRef: camping.bookingRef,
              pricePerNight: camping.pricePaid ? parseFloat(camping.pricePaid) : null,
              currency: camping.currency || 'EUR',
              notes: `Rating: ${camping.rating} (${camping.userRatingsTotal} avis)`,
              stepId: step.id,
              roadtripId: roadtrip.id,
              userId: testUser.id,
            },
          });
        }
      }

      console.log(`✓ ${waypoints.length} steps créés`);
      console.log(`✓ Distance totale: ${totalDistance} km`);
    }

    console.log(`\n✅ Import terminé!`);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
