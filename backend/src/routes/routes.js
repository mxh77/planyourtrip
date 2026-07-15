const express = require('express');
const auth = require('../middleware/auth');
const { log, error } = require('../services/logger');

const router = express.Router();

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * POST /api/routes/compute
 * Proxy vers Google Routes API v2 — la clé reste côté serveur.
 * Body: { origin: {lat, lng}, destination: {lat, lng}, alternatives?: boolean }
 */
router.post('/compute', auth, async (req, res) => {
  const { origin, destination, alternatives = false } = req.body;
  const userId = req.user?.userId;

  log('ROUTES', `🔹 Requête POST /api/routes/compute de l'utilisateur ${userId}`, {
    origin,
    destination,
    alternatives,
  });

  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    error('ROUTES', 'Coordonnées manquantes');
    return res.status(400).json({ error: 'origin et destination sont requis' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    error('ROUTES', 'GOOGLE_MAPS_API_KEY non configurée');
    return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY non configurée' });
  }

  const fieldMask = alternatives
    ? 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description'
    : 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';

  try {
    const response = await fetch(ROUTES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'DRIVE',
        computeAlternativeRoutes: alternatives,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      error('ROUTES', `Google API error ${response.status}`, { error: err });
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    log('ROUTES', `✅ Réponse pour route ${origin.lat},${origin.lng} → ${destination.lat},${destination.lng}`, {
      distanceMeters: data.routes?.[0]?.distanceMeters,
      duration: data.routes?.[0]?.duration,
    });
    return res.json(data);
  } catch (err) {
    error('ROUTES', 'Exception lors de l\'appel API', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/routes/geocode?latlng=lat,lng
 * Proxy vers Google Geocoding API — reverse geocoding.
 */
router.get('/geocode', auth, async (req, res) => {
  const { latlng } = req.query;
  if (!latlng) return res.status(400).json({ error: 'latlng requis' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY non configurée' });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latlng}&key=${apiKey}&language=fr`
    );
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
