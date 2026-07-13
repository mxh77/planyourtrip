/**
 * routes/campings.js — Recherche et disponibilité des campings
 */
const express  = require('express');
const gm       = require('../services/googleMaps');
const campSvc  = require('../services/camping');
const { checkCampingReservation } = require('../services/reservationScraper');

const router = express.Router();

// GET /api/campings/nearby?lat=&lng=&radius=&keyword=&campingcar=
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 20000, keyword, language = 'fr', campingcar } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });

    // Filtre camping-car : ajouter mots-clés spécifiques
    const isCampingCar = campingcar === 'true' || campingcar === '1';
    const effectiveKeyword = isCampingCar
      ? [keyword, 'camping car motorhome'].filter(Boolean).join(' ')
      : keyword;

    const [googleCampings, kampaohCampings] = await Promise.allSettled([
      gm.searchNearby({
        lat:     parseFloat(lat),
        lng:     parseFloat(lng),
        radius:  parseInt(radius),
        type:    'campground',
        keyword: effectiveKeyword,
        language,
      }),
      campSvc.searchKampaohNearby(parseFloat(lat), parseFloat(lng), Math.min(parseInt(radius) / 1000, 80)),
    ]);

    const google  = googleCampings.status  === 'fulfilled' ? googleCampings.value  : [];
    const kampaoh = kampaohCampings.status === 'fulfilled' ? kampaohCampings.value : [];

    // Fusionner : marquer les campings Google qui sont aussi sur Kampaoh
    const enriched = google.map(c => {
      const match = kampaoh.find(k =>
        distance(c.lat, c.lng, k.lat, k.lng) < 0.5 || // < 500m
        normalize(k.name).includes(normalize(c.name).slice(0, 8))
      );
      return { ...c, kampaohId: match?.id || null, source: 'google' };
    });

    // Ajouter les campings Kampaoh non trouvés par Google
    for (const k of kampaoh) {
      const exists = enriched.find(c => distance(c.lat, c.lng, k.lat, k.lng) < 0.5);
      if (!exists) enriched.push({ ...k, source: 'kampaoh' });
    }

    // Marquer les campings acceptant les camping-cars selon amenities Kampaoh
    const campingCarAmenityKeys = ['camper', 'camping-car', 'motorhome', 'autocaravana', 'campervan', 'aire'];
    // Domaines de modules de réservation détectables sans scraping
    const BOOKING_DOMAINS = {
      webcamp:    ['webcamp.fr', 'thelisresa.webcamp.fr'],
      kampaoh:    ['kampaoh.com'],
      pitchup:    ['pitchup.com'],
      campingcar_park: ['campingcar-park.com'],
      homecamper: ['homecamper.fr'],
      hipcamp:    ['hipcamp.com'],
      booking:    ['booking.com'],
    };
    const markedEnriched = enriched.map(c => {
      const amenities = (c.amenities || []).map(a => normalize(String(a)));
      const acceptsCampingCar = amenities.some(a => campingCarAmenityKeys.some(k => a.includes(k)))
        || campingCarAmenityKeys.some(k => normalize(c.name || '').includes(k));
      // Détection module de résa depuis l'URL du site
      const siteUrl = (c.website || '').toLowerCase();
      let bookingProvider = null;
      for (const [provider, domains] of Object.entries(BOOKING_DOMAINS)) {
        if (domains.some(d => siteUrl.includes(d))) { bookingProvider = provider; break; }
      }
      // webcampId heuristique : URL contient webcamp
      const webcampId = siteUrl.includes('webcamp.fr') ? (c.webcampId || 'unknown') : (c.webcampId || null);
      return { ...c, acceptsCampingCar, bookingProvider, webcampId };
    });

    // Si filtre camping-car actif : ne retourner que ceux marqués (ou tous si aucun marqué pour ne pas retourner vide)
    let finalResult = markedEnriched;
    if (isCampingCar) {
      const filtered = markedEnriched.filter(c => c.acceptsCampingCar);
      finalResult = filtered.length > 0 ? filtered : markedEnriched;
    }

    finalResult.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    res.json(finalResult);
  } catch (e) { next(e); }
});

// GET /api/campings/kampaoh/nearby?lat=&lng=&radius=
router.get('/kampaoh/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 50 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });
    const result = await campSvc.searchKampaohNearby(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/campings/availability
// Body: { camping: {name, placeId, website, kampaohId, webcampId}, checkin, checkout, groupSize }
router.post('/availability', async (req, res, next) => {  try {
    const { camping, checkin, checkout, groupSize = 2 } = req.body;
    if (!camping || !checkin || !checkout)
      return res.status(400).json({ error: 'camping, checkin, checkout requis' });

    const result = await campSvc.checkAvailability({ camping, checkin, checkout, groupSize });
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/campings/check-reservation?url=
router.get('/check-reservation', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url requis' });
    // Valider que c'est bien une URL HTTP(S)
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'URL invalide' });
    }
    const result = await checkCampingReservation(url);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/campings/availability/batch
// Body: { campings: [...], checkin, checkout, groupSize }
router.post('/availability/batch', async (req, res, next) => {
  try {
    const { campings, checkin, checkout, groupSize = 2 } = req.body;
    if (!campings?.length || !checkin || !checkout)
      return res.status(400).json({ error: 'campings[], checkin, checkout requis' });

    const results = await Promise.allSettled(
      campings.slice(0, 10).map(c => campSvc.checkAvailability({ camping: c, checkin, checkout, groupSize }))
    );

    res.json(results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
  } catch (e) { next(e); }
});

// GET /api/campings/kampaoh/:propertyId/availability?checkin=&checkout=
router.get('/kampaoh/:propertyId/availability', async (req, res, next) => {
  try {
    const { checkin, checkout } = req.query;
    if (!checkin || !checkout) return res.status(400).json({ error: 'checkin/checkout requis' });
    const result = await campSvc.checkKampaoh(req.params.propertyId, checkin, checkout);
    res.json(result);
  } catch (e) { next(e); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function distance(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
               Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

module.exports = router;
