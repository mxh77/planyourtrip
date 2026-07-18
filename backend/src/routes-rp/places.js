/**
 * routes/places.js — Places, Autocomplete, Geocoding, Elevation
 */
const express = require('express');
const axios   = require('axios');
const gm      = require('../services/googleMaps');

const router = express.Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────
function log(tag, msg) { console.log(`[${tag}] ${msg}`); }
function error(tag, msg, e) { console.error(`[${tag}] ${msg}:`, e?.message); }

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

// ─── Photo proxy ────────────────────────────────────────────────────────────
// Places API v1 retourne un nom de ressource (ex: "places/ChIJ.../photos/AU...")
// qu'il faut résoudre via le media endpoint.
// GET /api/places/photo?photoName=...&maxWidth=...&maxHeight=...
router.get('/photo', async (req, res, next) => {
  try {
    const { photoName, maxWidth = 400, maxHeight = 400 } = req.query;
    if (!photoName) return res.status(400).json({ error: 'photoName requis' });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'API key non configurée' });

    const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeight}&maxWidthPx=${maxWidth}&skipHttpRedirect=true&key=${apiKey}`;
    const resp = await axios.get(url, { timeout: 5000 });
    
    if (resp.data?.photoUri) {
      // Rediriger le client vers l'URL réelle de l'image
      return res.redirect(302, resp.data.photoUri);
    }
    res.status(404).json({ error: 'Photo non trouvée' });
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ error: 'Photo non trouvée' });
    console.error('[PHOTO] Erreur proxy photo:', e.message);
    res.status(502).json({ error: 'Erreur chargement photo' });
  }
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

// ─── Search by Category (for map category buttons) ──────────────────────────

// POST /api/places/searchCategory
// Body: { bounds: { ne: {lat,lng}, sw: {lat,lng} }, category, includedTypes, includeP4N, p4nTypeIds, maxResults, language }
router.post('/searchCategory', async (req, res, next) => {
  try {
    const {
      bounds,
      category = 'pois',
      includedTypes = [],
      includeP4N = false,
      p4nTypeIds = [],
      maxResults = 20,
      language = 'fr',
    } = req.body;

    if (!bounds?.ne?.lat || !bounds?.sw?.lat) {
      return res.status(400).json({ error: 'bounds.ne et bounds.sw requis' });
    }

    // Calculer le centre du viewport
    const centerLat = (bounds.ne.lat + bounds.sw.lat) / 2;
    const centerLng = (bounds.ne.lng + bounds.sw.lng) / 2;

    // Calculer le rayon (60% de la diagonale des bounds, max 50km)
    const R = 6371000;
    const dLat = (bounds.ne.lat - bounds.sw.lat) * Math.PI / 180;
    const dLng = (bounds.ne.lng - bounds.sw.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(bounds.sw.lat * Math.PI / 180) * Math.cos(bounds.ne.lat * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const radius = Math.min(Math.round(R * c * 0.6), 50000);

    log('SEARCH', `🔍 searchCategory: ${category} centre=(${centerLat.toFixed(4)},${centerLng.toFixed(4)}) rayon=${radius}m`);

    const results = [];

    // 1. Google Places search
    if (includedTypes.length > 0) {
      try {
        const places = await gm.searchNearbyV1({
          lat: centerLat,
          lng: centerLng,
          radius,
          includedTypes,
          maxResultCount: maxResults,
          languageCode: language,
        });

        for (const p of places) {
          results.push({
            id: `google_${p.placeId}`,
            source: 'google',
            placeId: p.placeId,
            name: p.name,
            latitude: p.lat,
            longitude: p.lng,
            address: p.address || '',
            rating: p.rating || null,
            userRatingCount: p.userRatingCount || null,
            types: p.types || [],
            overlayType: category,
            photoName: p.photos?.[0] || null,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.placeId}`,
          });
        }
        log('SEARCH', `  ✓ Google: ${places.length} résultats`);
      } catch (e) {
        log('SEARCH', `  ✗ Google: ${e.message}`);
      }
    }

    // 2. Algolia / AllTrails search (pour la catégorie "trails" uniquement)
    if (category === 'trails') {
      try {
        const algoliaAppId = process.env.ALGOLIA_APP_ID;
        const algoliaApiKey = process.env.ALGOLIA_API_KEY;
        if (algoliaAppId && algoliaApiKey) {
          const algoliaRadius = Math.min(radius, 100000); // max 100km
          const algoliaRes = await axios.post(
            `https://${algoliaAppId}-3.algolianet.com/1/indexes/alltrails_primary_fr-FR/query`,
            {
              hitsPerPage: maxResults,
              aroundLatLng: `${centerLat},${centerLng}`,
              aroundRadius: algoliaRadius,
              facetFilters: [['type:trail']],
              attributesToRetrieve: ['name', 'length', 'elevation_gain', 'avg_rating', 'popularity', '_geoloc', 'duration_minutes', 'slug', 'objectID'],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Algolia-API-Key': algoliaApiKey,
                'X-Algolia-Application-Id': algoliaAppId,
              },
              timeout: 8000,
            }
          );

          const hits = algoliaRes.data?.hits || [];
          // Filtrer : ne garder que les vrais trails (objectID commence par "trail-")
          const trailsOnly = hits.filter(h => h.objectID && h.objectID.startsWith('trail-'));

          for (const h of trailsOnly) {
            results.push({
              id: `algolia_${h.objectID}`,
              source: 'algolia',
              placeId: h.objectID,
              name: h.name,
              latitude: h._geoloc?.lat || centerLat,
              longitude: h._geoloc?.lng || centerLng,
              address: '',
              rating: h.avg_rating || null,
              types: ['trail'],
              overlayType: category,
              // Champs spécifiques AllTrails
              lengthKm: h.length ? Math.round(h.length / 1000 * 10) / 10 : null,
              elevationGain: h.elevation_gain ? Math.round(h.elevation_gain) : null,
              avgRating: h.avg_rating || null,
              popularity: h.popularity || null,
              durationMinutes: h.duration_minutes || null,
              alltrailsUrl: h.slug ? `https://www.alltrails.com/${h.slug}` : null,
            });
          }
          log('SEARCH', `  ✓ Algolia: ${trailsOnly.length} résultats (${hits.length} total)`);
        } else {
          log('SEARCH', '  ⚠️ Algolia: credentials manquants');
        }
      } catch (e) {
        log('SEARCH', `  ✗ Algolia: ${e.message}`);
      }
    }

    // 3. Park4Night search
    if (includeP4N) {
      try {
        const p4nRadius = Math.min(Math.round(radius / 1000), 200);
        const p4nRes = await axios.get('https://park4night.com/api/places/around', {
          params: { lat: centerLat, lng: centerLng, radius: p4nRadius, filter: '{}', lang: language },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Referer': `https://park4night.com/fr/search?lat=${centerLat}&lng=${centerLng}&z=13`,
          },
          timeout: 10000,
        });

        let raw = p4nRes.data;
        if (typeof raw === 'string') {
          try { raw = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')); }
          catch { try { raw = JSON.parse(raw); } catch { raw = []; } }
        }
        const items = Array.isArray(raw) ? raw : (raw?.places ?? raw?.results ?? []);
        const filtered = p4nTypeIds.length > 0
          ? items.filter(p => p4nTypeIds.includes(p.type?.id))
          : items;

        for (const p of filtered) {
          const typeId = p.type?.id ?? 7;
          const typeLabel = p.type?.label ?? 'Lieu';
          results.push({
            id: `p4n_${p.id}`,
            source: 'p4n',
            placeId: String(p.id),
            name: p.title_short || p.name || `#${p.id}`,
            latitude: p.lat,
            longitude: p.lng,
            address: p.address || null,
            rating: p.rating || null,
            types: [],
            overlayType: category,
            p4nTypeId: typeId,
            p4nTypeLabel: typeLabel,
            p4nUrl: `https://park4night.com/fr/place/${p.id}`,
          });
        }
        log('SEARCH', `  ✓ P4N: ${filtered.length} résultats (${items.length} total)`);
      } catch (e) {
        log('SEARCH', `  ✗ P4N: ${e.message}`);
      }
    }

    // Dédoublonnage : pour les trails, si un résultat Algolia existe,
    // supprimer les résultats Google Places dont le nom est similaire.
    if (category === 'trails') {
      const algoliaResults = results.filter(r => r.source === 'algolia');
      if (algoliaResults.length > 0) {
        const toRemove = new Set();
        for (const alg of algoliaResults) {
          const algWords = alg.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.source !== 'google') continue;
            // Compter les mots significatifs en commun
            const rWords = r.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const common = algWords.filter(w => rWords.includes(w)).length;
            // Si >= 2 mots communs ou un mot unique très long, c'est probablement le même lieu
            if (common >= 2 || (common >= 1 && Math.max(...algWords.map(w => w.length)) >= 7)) {
              toRemove.add(i);
            }
          }
        }
        if (toRemove.size > 0) {
          const removed = results.filter((_, i) => toRemove.has(i));
          log('SEARCH', `  🗑️ Dédoublonnage: ${toRemove.size} Google supprimés (fusionnés dans Algolia)`);
          removed.forEach(r => log('SEARCH', `     ✗ ${r.name}`));
          // Filtrer en gardant les Algolia et les Google non doublons
          const newResults = results.filter((_, i) => !toRemove.has(i));
          results.length = 0;
          results.push(...newResults);
        }
      }
    }

    log('SEARCH', `  ✅ Total: ${results.length} résultats pour "${category}"`);
    res.json({ results, category, bounds: req.body.bounds, radius });
  } catch (e) {
    error('SEARCH', 'Erreur searchCategory', e);
    next(e);
  }
});

module.exports = router;
