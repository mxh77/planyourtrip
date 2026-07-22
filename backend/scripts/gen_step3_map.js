/**
 * Génère l'image Google Maps Static pour l'étape 3 (Lauterbrunnen)
 * avec les corrections de trajet (départ = isDeparture de l'étape précédente)
 */
const prisma = require('../src/lib/prisma');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function getEffectiveDeparture(step) {
  if (!step) return null;
  const items = [...(step.accommodations || []), ...(step.activities || [])];
  const d = items.find(i => i.isDeparture && i.latitude && i.longitude);
  if (d) return { lat: d.latitude, lng: d.longitude };
  if (step.departureLatitude && step.departureLongitude) return { lat: step.departureLatitude, lng: step.departureLongitude };
  if (step.latitude && step.longitude) return { lat: step.latitude, lng: step.longitude };
  return null;
}

function getEffectiveArrival(step) {
  if (!step) return null;
  const items = [...(step.accommodations || []), ...(step.activities || [])];
  const a = items.find(i => i.isArrival && i.latitude && i.longitude);
  if (a) return { lat: a.latitude, lng: a.longitude };
  if (step.arrivalLatitude && step.arrivalLongitude) return { lat: step.arrivalLatitude, lng: step.arrivalLongitude };
  if (step.latitude && step.longitude) return { lat: step.latitude, lng: step.longitude };
  return null;
}

async function main() {
  const rt = await prisma.roadtrip.findFirst({
    where: { title: { contains: 'Europe' } },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: true,
          activities: { orderBy: { startTime: 'asc' } },
        },
      },
    },
  });

  if (!rt) {
    console.log('❌ Roadtrip Europe non trouvé');
    return;
  }

  const step = rt.steps[2]; // Lauterbrunnen
  const prev = rt.steps[1]; // Dole du Jura

  console.log('Étape 3:', step.name);
  console.log('Étape précédente:', prev.name);

  const dep = getEffectiveDeparture(prev);
  const arr = getEffectiveArrival(step);

  console.log('Départ (prevStep):', dep?.lat, dep?.lng);
  console.log('Arrivée (step):', arr?.lat, arr?.lng);

  const dl = dep?.lat ?? step.departureLatitude ?? step.latitude;
  const dn = dep?.lng ?? step.departureLongitude ?? step.longitude;
  const al = arr?.lat ?? step.latitude;
  const an = arr?.lng ?? step.longitude;

  const key = process.env.GOOGLE_MAPS_API_KEY || '';

  const url =
    'https://maps.googleapis.com/maps/api/staticmap' +
    '?visible=' + encodeURIComponent(dl + ',' + dn + '|' + al + ',' + an) +
    '&size=640x400&scale=2&maptype=roadmap' +
    '&markers=' + encodeURIComponent('color:green|label:D|' + dl + ',' + dn) +
    '&markers=' + encodeURIComponent('color:red|label:A|' + al + ',' + an) +
    (prev?.routeEncodedPolyline
      ? '&path=color:red|weight:4|enc:' + encodeURIComponent(prev.routeEncodedPolyline)
      : '') +
    '&key=' + key;

  console.log('Téléchargement...');
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  const outPath = path.join(__dirname, '..', 'step3_lauterbrunnen.png');
  fs.writeFileSync(outPath, Buffer.from(resp.data));
  console.log('✅ Image sauvegardée : step3_lauterbrunnen.png (' + (resp.data.length / 1024).toFixed(1) + ' Ko)');
}

main().catch(e => console.error('❌', e.message));
