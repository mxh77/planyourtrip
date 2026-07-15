/**
 * routes/places.js — Places, Autocomplete, Geocoding, Elevation
 */
const express = require('express');
const gm      = require('../services/googleMaps');
const { log, error } = require('../services/logger');

const router = express.Router();

// ─── NEW Google Places API v1 (utilisé par le frontend mobile/web) ────────────

// POST /api/places/searchNearby
// Body: { lat, lng, radius, includedTypes: [String], maxResultCount, languageCode }
router.post('/searchNearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000, includedTypes = [], maxResultCount = 6, languageCode = 'fr' } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat et lng requis' });

    log('PLACES', `🔹 Recherche nearby: ${lat},${lng} rayon=${radius}m types=${includedTypes.join(',')}`, {
      radius,
      includedTypes,
      maxResultCount,
    });

    const places = await gm.searchNearbyV1({
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius: parseInt(radius),
      includedTypes,
      maxResultCount: parseInt(maxResultCount),
      languageCode,
    });
    
    log('PLACES', `✅ Trouvé ${places.length} lieux`);
    res.json({ places });
  } catch (e) { 
    error('PLACES', 'Erreur searchNearby', e);
    next(e); 
  }
});

// POST /api/places/searchText
// Body: { textQuery, includedType, maxResultCount, languageCode, locationBias }
router.post('/searchText', async (req, res, next) => {
  try {
    const { textQuery, includedType, maxResultCount = 20, languageCode = 'fr', locationBias } = req.body;
    if (!textQuery) return res.status(400).json({ error: 'textQuery requis' });

    log('PLACES', `🔹 Recherche texte: "${textQuery}" type=${includedType}`, {
      maxResultCount,
      hasLocationBias: !!locationBias,
    });

    const places = await gm.searchTextV1({
      textQuery,
      includedType,
      maxResultCount: parseInt(maxResultCount),
      languageCode,
      locationBias,
    });
    
    log('PLACES', `✅ Trouvé ${places.length} lieux pour "${textQuery}"`);
    res.json({ places });
  } catch (e) { 
    error('PLACES', 'Erreur searchText', e);
    next(e); 
  }
});

// ─── Legacy Google Places API (anciennes routes) ────────────────────────────

// GET /api/places/autocomplete?input=&lat=&lng=&types=
router.get('/autocomplete', async (req, res, next) => {
  try {
    const { input, sessionToken, lat, lng, types, language = 'fr' } = req.query;
    if (!input) return res.status(400).json({ error: 'input requis' });

    const location = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
    const results  = await gm.autocomplete({ input, sessionToken, location, types, language });
    res.json(results);
  } catch (e) { next(e); }
});

// GET /api/places/nearby?lat=&lng=&radius=&type=&keyword=
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 20000, type = 'campground', keyword, language = 'fr' } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });

    const results = await gm.searchNearby({
      lat: parseFloat(lat), lng: parseFloat(lng),
      radius: parseInt(radius), type, keyword, language,
    });
    res.json(results);
  } catch (e) { next(e); }
});

// GET /api/places/search?query=&lat=&lng=
router.get('/search', async (req, res, next) => {
  try {
    const { query, lat, lng, radius = 30000, language = 'fr' } = req.query;
    if (!query) return res.status(400).json({ error: 'query requis' });

    const location = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
    const results  = await gm.searchText({ query, location, radius: parseInt(radius), language });
    res.json(results);
  } catch (e) { next(e); }
});

// GET /api/places/:placeId
router.get('/:placeId', async (req, res, next) => {
  try {
    const { sessionToken, language = 'fr' } = req.query;
    const details = await gm.getPlaceDetails({ placeId: req.params.placeId, sessionToken, language });
    res.json(details);
  } catch (e) { next(e); }
});

// GET /api/places/geocode?address=
router.get('/geocode/address', async (req, res, next) => {
  try {
    const { address, language = 'fr' } = req.query;
    if (!address) return res.status(400).json({ error: 'address requis' });
    const result = await gm.geocode({ address, language });
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/places/reverse?lat=&lng=
router.get('/reverse/geocode', async (req, res, next) => {
  try {
    const { lat, lng, language = 'fr' } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' });
    const result = await gm.reverseGeocode({ lat: parseFloat(lat), lng: parseFloat(lng), language });
    res.json(result ?? { address: null });
  } catch (e) {
    // Retourner null proprement plutôt qu'un 500 (ex: clé API sans Geocoding activé)
    res.json({ address: null });
  }
});

// GET /api/places/elevation?path=lat,lng|lat,lng&samples=
router.get('/elevation/profile', async (req, res, next) => {
  try {
    const { path, samples = 100 } = req.query;
    if (!path) return res.status(400).json({ error: 'path requis (lat,lng|lat,lng)' });

    const points = path.split('|').map(p => {
      const [lat, lng] = p.split(',').map(Number);
      return { lat, lng };
    });
    const elevation = await gm.getElevation({ path: points, samples: parseInt(samples) });
    res.json(elevation);
  } catch (e) { next(e); }
});

module.exports = router;
