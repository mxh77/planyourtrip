/**
 * routes/trails.js — Sentiers de randonnée (OSM + ORS)
 */
const express   = require('express');
const trailsSvc = require('../services/trails');

const router = express.Router();

// GET /api/trails/nearby?lat=&lng=&radius=
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 15000 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });

    res.set('Cache-Control', 'no-store');
    const result = await trailsSvc.searchTrails(
      parseFloat(lat), parseFloat(lng), parseInt(radius)
    );
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/trails/route — Calcule itinéraire pédestre/vélo
// Body: { coordinates: [[lng,lat],...], profile }
router.post('/route', async (req, res, next) => {
  try {
    const { coordinates, profile = 'foot-hiking' } = req.body;
    if (!coordinates?.length) return res.status(400).json({ error: 'coordinates requis' });

    const result = await trailsSvc.getOrsRoute({ coordinates, profile });
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/trails/isochrone?lat=&lng=&minutes=&profile=
router.get('/isochrone', async (req, res, next) => {
  try {
    const { lat, lng, minutes = 30, profile = 'foot-hiking' } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });

    const result = await trailsSvc.getIsochrone({
      lat: parseFloat(lat), lng: parseFloat(lng),
      minutes: parseInt(minutes), profile,
    });
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
