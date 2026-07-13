const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_ID = 'cmmheg1660002tr2061oq6u72';

// All 18 waypoints hardcoded from the JSON data
const waypoints = [
  {
    name: 'Maison',
    location: 'Clévilliers, France',
    lat: 48.543237, lng: 1.38867,
    startDate: null, endDate: new Date('2026-07-31'),
    nights: 0,
    notes: 'Camping car : GY-212-ER',
    stepType: 'DEPARTURE',
    trails: [], pois: [],
    selectedCamping: null
  },
  {
    name: 'Dole du Jura',
    location: '39100 Dole',
    lat: 47.09534, lng: 5.49081,
    startDate: new Date('2026-07-31'), endDate: new Date('2026-08-01'),
    nights: 1,
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Camping des Bords de Loue', address: 'Rue du Camping, Parcey',
      lat: 47.0162101, lng: 5.4814909,
      bookingRef: '18483538', pricePaid: 59, currency: 'EUR',
      campingNotes: 'Camping municipal calme en bord de Loue. Prix : 59€ | Réservation : 18483538'
    }
  },
  {
    name: 'Lauterbrunnen',
    location: 'Lauterbrunnen, Suisse',
    lat: 46.5935058, lng: 7.9090981,
    startDate: new Date('2026-08-01'), endDate: new Date('2026-08-02'),
    nights: 1,
    stepType: 'STAGE',
    trails: [
      { name: 'Grütschalp - Mürren - Schilthorn', lat: 46.5582745, lng: 7.8912581 },
      { name: 'Staubbachfall', lat: 46.5896276, lng: 7.9052264 }
    ],
    pois: [],
    selectedCamping: {
      name: 'Camping Gletscherdorf', address: 'Locherbodenstrasse 29, Grindelwald',
      lat: 46.6211394, lng: 8.0450519,
      bookingRef: 'XIMV-YICW', pricePaid: 121.80, currency: 'CHF',
      campingNotes: 'Prix : 121.80 CHF | Réservation : XIMV-YICW'
    }
  },
  {
    name: 'Gorges de l\'Aar',
    location: 'Gorges de l\'Aar, Aareschluchtstrasse, Schattenhalb, Suisse',
    lat: 46.7192366, lng: 8.2122009,
    startDate: new Date('2026-08-02'), endDate: new Date('2026-08-02'),
    nights: 0,
    stepType: 'STOP',
    trails: [
      { name: 'Gorges de l\'Aar', lat: 46.7192366, lng: 8.2122009 },
      { name: 'Uferweg Iseltwald', lat: 46.7181312, lng: 7.9818879 }
    ],
    pois: [],
    selectedCamping: null
  },
  {
    name: 'Lucerne',
    location: 'Lucerne, Suisse',
    lat: 47.0501682, lng: 8.3093072,
    startDate: new Date('2026-08-02'), endDate: new Date('2026-08-04'),
    nights: 2,
    stepType: 'STAGE',
    trails: [],
    pois: [
      { name: 'Pilatus', location: 'Pilatus, 6010 Alpnach, Suisse', lat: 46.9794705, lng: 8.2548011 }
    ],
    selectedCamping: {
      name: 'TCS Camping Sempach', address: 'Seelandstrasse 6, Sempach',
      lat: 47.1253532, lng: 8.1899323,
      bookingRef: '50153', pricePaid: 200, currency: 'CHF',
      campingNotes: 'Prix : 200 CHF | Réservation : 50153'
    }
  },
  {
    name: 'Verzasca',
    location: 'Verzasca, Suisse',
    lat: 46.2274803, lng: 8.8519657,
    startDate: new Date('2026-08-04'), endDate: new Date('2026-08-04'),
    nights: 0,
    stepType: 'STOP',
    notes: 'Sonogno ou randos le long de la rivière',
    trails: [], pois: [],
    selectedCamping: null
  },
  {
    name: 'Côme',
    location: 'Côme, Italie',
    lat: 45.8063817, lng: 9.0851867,
    startDate: new Date('2026-08-04'), endDate: new Date('2026-08-05'),
    nights: 1,
    stepType: 'STAGE',
    trails: [
      { name: 'Parco Regionale Spina Verde', lat: 45.8180778, lng: 9.0263415 },
      { name: 'Cascata del Botto', lat: 45.9308374, lng: 8.9963889 }
    ],
    pois: [],
    selectedCamping: {
      name: 'Camping Monte Generoso', address: 'Via Tannini 12, Melano',
      lat: 45.9280952, lng: 8.9766778,
      bookingRef: '31936042', pricePaid: 106.40, currency: 'CHF',
      campingNotes: 'Prix : 106.40 CHF | Réservation : 31936042'
    }
  },
  {
    name: 'Vérone',
    location: 'Vérone, Italie',
    lat: 45.4383659, lng: 10.9917136,
    startDate: new Date('2026-08-05'), endDate: new Date('2026-08-05'),
    nights: 0,
    stepType: 'STOP',
    trails: [], pois: [],
    selectedCamping: null
  },
  {
    name: 'Lago di Garda',
    location: 'Agriturismo Agricamping GARDA NATURA, Via della Valletta, Costermano, Vérone, Italie',
    lat: 45.592641, lng: 10.7186121,
    startDate: new Date('2026-08-05'), endDate: new Date('2026-08-07'),
    nights: 2,
    stepType: 'STAGE',
    notes: 'Monte Baldo par téléphérique : 10h30. Parking Retelino. Chateau + Ville',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Agriturismo Agricamping GARDA NATURA', address: 'Via della Valletta, 19, Costermano sul Garda',
      lat: 45.592641, lng: 10.7186121,
      bookingRef: '3107', pricePaid: 260, currency: 'EUR',
      campingNotes: 'Prix : 260 € | Réservation : 3107'
    }
  },
  {
    name: 'Dolomites',
    location: 'Camping Sass Dlacia, Badia, Sud-Tyrol, Italie',
    lat: 46.55419, lng: 11.969996,
    startDate: new Date('2026-08-07'), endDate: new Date('2026-08-12'),
    nights: 5,
    stepType: 'STAGE',
    notes: 'Booking 36289385/36289397. Jour 1: Seceda/Alpe di Siusi. Jour 2: Tre Cime (10h30). Jour 3: Lac de Braies. Jour 4: Lagazuoi. Jour 5: rando autour du camping',
    trails: [
      { name: 'Tre Cime di Lavaredo - sentier', lat: 46.6125428, lng: 12.2965549 }
    ],
    pois: [
      { name: 'Pragser Wildsee', location: 'Pragser Wildsee, 39030 Braies, Italie', lat: 46.694333, lng: 12.0854273 },
      { name: 'Seceda', location: 'Seceda, 39046 Urtijëi, Italie', lat: 46.5980566, lng: 11.7241678 },
      { name: 'Alpe di Siusi', location: 'Alpe di Siusi, Province autonome de Bolzano, Italie', lat: 46.5423435, lng: 11.6168855 },
      { name: 'Tre Cime di Lavaredo', location: 'Tre Cime di Lavaredo, Italie', lat: 46.6186777, lng: 12.3027679 }
    ],
    selectedCamping: {
      name: 'Camping Sass Dlacia', address: 'Sciarè 11 San Cassiano in, Badia',
      lat: 46.55419, lng: 11.969996,
      bookingRef: '36289385 / 36289397', pricePaid: 179, currency: 'EUR',
      campingNotes: 'Prix : 179 €/nuit | Réservations : 36289385 / 36289397'
    }
  },
  {
    name: 'Ile de Krk',
    location: 'Njivice, Croatie',
    lat: 45.1644434, lng: 14.5448533,
    startDate: new Date('2026-08-12'), endDate: new Date('2026-08-16'),
    nights: 4,
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Aminess Style Camping Atea Resort', address: 'Primorska cesta 41, Njivice',
      lat: 45.17004, lng: 14.547028,
      bookingRef: 'PH27866820', pricePaid: 763.84, currency: 'EUR',
      campingNotes: 'Prix : 763.84 € | Réservation : PH27866820'
    }
  },
  {
    name: 'Parc national du Triglav',
    location: 'Triglav National Park, Bohinjsko jezero, Slovénie',
    lat: 46.3424727, lng: 13.7990434,
    startDate: new Date('2026-08-16'), endDate: new Date('2026-08-18'),
    nights: 2,
    stepType: 'STAGE',
    trails: [
      { name: 'Zlatorog Fairy Trail', lat: 46.2790404, lng: 13.8347003 }
    ],
    pois: [],
    selectedCamping: {
      name: 'Maya outdoor center', address: 'Volče 87c, Tolmin',
      lat: 46.1814155, lng: 13.716958,
      bookingRef: '9062', pricePaid: 183, currency: 'EUR',
      campingNotes: 'Prix : 183 € | Réservation : 9062'
    }
  },
  {
    name: 'Innsbruck',
    location: 'Innsbruck, Autriche',
    lat: 47.2675322, lng: 11.3910349,
    startDate: new Date('2026-08-18'), endDate: new Date('2026-08-19'),
    nights: 1,
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Camping Aschach Castle', address: 'Hochschwarzweg 2, Volders',
      lat: 47.2870194, lng: 11.5724585,
      bookingRef: null, pricePaid: null, currency: 'EUR',
      campingNotes: 'Camping près du château. Prix non renseigné.'
    }
  },
  {
    name: 'Château de Neuschwanstein',
    location: 'Neuschwanstein Castle, Neuschwansteinstraße, Schwangau, Allemagne',
    lat: 47.557574, lng: 10.7498004,
    startDate: new Date('2026-08-19'), endDate: new Date('2026-08-20'),
    nights: 1,
    notes: 'Chateau 20 : 11:45',
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Camping Brunnen', address: 'Seestraße 81, Schwangau-Brunnen',
      lat: 47.597439, lng: 10.7370703,
      bookingRef: '270058', pricePaid: 42.73, currency: 'EUR',
      campingNotes: 'Prix : 42.73 € | Réservation : 270058'
    }
  },
  {
    name: 'Lac de Constance',
    location: 'Constance, Allemagne',
    lat: 47.6779808, lng: 9.1736741,
    startDate: new Date('2026-08-20'), endDate: new Date('2026-08-21'),
    nights: 1,
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Camping Fischerhaus', address: 'Promenadenstrasse 52, Kreuzlingen',
      lat: 47.6469763, lng: 9.1986207,
      bookingRef: null, pricePaid: 85, currency: 'CHF',
      campingNotes: 'Prix : 85 CHF'
    }
  },
  {
    name: 'Europa-Park',
    location: 'Europa-Park, Europa-Park-Straße, Rust, Allemagne',
    lat: 48.2660194, lng: 7.7220076,
    startDate: new Date('2026-08-21'), endDate: new Date('2026-08-23'),
    nights: 2,
    stepType: 'STAGE',
    trails: [], pois: [],
    selectedCamping: {
      name: 'Europa-Park-Camping', address: 'Rheinweg 5, Rust',
      lat: 48.2728443, lng: 7.7148479,
      bookingRef: 'CR14447013', pricePaid: 181.60, currency: 'EUR',
      campingNotes: 'Prix : 181.60 € | Réservation : CR14447013'
    }
  },
  {
    name: 'Reims',
    location: '51100 Reims',
    lat: 49.258329, lng: 4.031696,
    startDate: new Date('2026-08-23'), endDate: new Date('2026-08-24'),
    nights: 1,
    stepType: 'STOP',
    trails: [], pois: [],
    selectedCamping: null
  },
  {
    name: 'Clévilliers',
    location: '28300 Clévilliers',
    lat: 48.543237, lng: 1.38867,
    startDate: new Date('2026-08-24'), endDate: new Date('2026-08-24'),
    nights: 0,
    stepType: 'RETURN',
    trails: [], pois: [],
    selectedCamping: null
  }
];

async function main() {
  console.log('=== Creating Roadtrip Europe 2026 ===\n');

  // 1. Delete existing roadtrip with same title (to avoid duplicates)
  const existing = await prisma.roadtrip.findFirst({
    where: { title: 'Roadtrip Europe 2026', userId: USER_ID }
  });
  if (existing) {
    console.log(`Deleting existing roadtrip "${existing.title}" (id=${existing.id})...`);
    await prisma.roadtrip.delete({ where: { id: existing.id } });
    console.log('  Deleted.');
  }

  // 2. Create the roadtrip
  const roadtrip = await prisma.roadtrip.create({
    data: {
      title: 'Roadtrip Europe 2026',
      startDate: new Date('2026-07-31'),
      endDate: new Date('2026-08-24'),
      status: 'PLANNED',
      userId: USER_ID,
    }
  });
  console.log(`Created roadtrip: id=${roadtrip.id}, title="${roadtrip.title}"`);

  // 3. Create all steps, accommodations, and activities
  let createdSteps = 0;
  let createdAccommodations = 0;
  let createdActivities = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const stepTypeLabel = wp.stepType;

    const step = await prisma.step.create({
      data: {
        name: `${wp.name}`,
        location: wp.location || null,
        latitude: wp.lat,
        longitude: wp.lng,
        startDate: wp.startDate,
        endDate: wp.endDate,
        notes: wp.notes || null,
        order: i,
        roadtripId: roadtrip.id,
        userId: USER_ID,
      }
    });
    createdSteps++;
    console.log(`  Step ${i}: "${wp.name}" (${stepTypeLabel}) -> id=${step.id}`);

    // Create accommodation if selectedCamping exists
    if (wp.selectedCamping) {
      const camp = wp.selectedCamping;
      const checkIn = wp.startDate;
      const checkOut = wp.endDate;
      
      const accommodation = await prisma.accommodation.create({
        data: {
          type: 'CAMPING',
          name: camp.name,
          address: camp.address || null,
          latitude: camp.lat || null,
          longitude: camp.lng || null,
          checkIn: checkIn,
          checkOut: checkOut,
          bookingRef: camp.bookingRef || undefined,
          pricePerNight: camp.pricePaid || undefined,
          currency: camp.currency || 'EUR',
          notes: camp.campingNotes || null,
          status: 'BOOKED',
          stepId: step.id,
          userId: USER_ID,
          roadtripId: roadtrip.id,
        }
      });
      createdAccommodations++;
      const priceStr = camp.pricePaid ? `${camp.pricePaid} ${camp.currency}` : 'N/A';
      const refStr = camp.bookingRef ? `ref=${camp.bookingRef}` : 'no ref';
      console.log(`    -> Accommodation: "${camp.name}" (${priceStr}, ${refStr}) -> id=${accommodation.id}`);
    }

    // Create activities for trails (HIKING type)
    if (wp.trails && wp.trails.length > 0) {
      for (let t = 0; t < wp.trails.length; t++) {
        const trail = wp.trails[t];
        const activity = await prisma.activity.create({
          data: {
            type: 'HIKING',
            name: trail.name,
            location: wp.location || null,
            latitude: trail.lat || null,
            longitude: trail.lng || null,
            status: 'PLANNED',
            order: t,
            stepId: step.id,
            userId: USER_ID,
            roadtripId: roadtrip.id,
          }
        });
        createdActivities++;
        console.log(`    -> Activity (HIKING): "${trail.name}" -> id=${activity.id}`);
      }
    }

    // Create activities for POIs (ACTIVITY type)
    if (wp.pois && wp.pois.length > 0) {
      for (let p = 0; p < wp.pois.length; p++) {
        const poi = wp.pois[p];
        const activity = await prisma.activity.create({
          data: {
            type: 'ACTIVITY',
            name: poi.name,
            location: poi.location || null,
            latitude: poi.lat || null,
            longitude: poi.lng || null,
            status: 'PLANNED',
            order: p,
            stepId: step.id,
            userId: USER_ID,
            roadtripId: roadtrip.id,
          }
        });
        createdActivities++;
        console.log(`    -> Activity (POI): "${poi.name}" -> id=${activity.id}`);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Roadtrip:     "Roadtrip Europe 2026" (id=${roadtrip.id})`);
  console.log(`Status:       PLANNED`);
  console.log(`Period:       2026-07-31 to 2026-08-24`);
  console.log(`Steps:        ${createdSteps}`);
  console.log(`Accommodations: ${createdAccommodations}`);
  console.log(`Activities:   ${createdActivities}`);
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
