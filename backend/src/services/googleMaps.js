/**
 * googleMaps.js — Wrapper pour toutes les API Google Maps
 * Places, Directions, Elevation, Geocoding, Place Autocomplete
 */
const axios = require('axios');

const BASE  = 'https://maps.googleapis.com/maps/api';
const KEY   = () => process.env.GOOGLE_MAPS_API_KEY;

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkKey() {
  if (!KEY()) throw Object.assign(new Error('GOOGLE_MAPS_API_KEY non configurée'), { status: 503 });
}

function gmError(data, url) {
  const s = data.status;
  if (s === 'OK' || s === 'ZERO_RESULTS') return null;
  const msg = {
    REQUEST_DENIED:        'Clé API Google refusée ou non activée pour ce service.',
    OVER_QUERY_LIMIT:      'Quota Google dépassé.',
    INVALID_REQUEST:       'Paramètres de requête invalides.',
    NOT_FOUND:             'Lieu non trouvé.',
    MAX_WAYPOINTS_EXCEEDED:'Trop de points de passage (max 25).',
  }[s] || `Erreur Google Maps (${s})`;
  return Object.assign(new Error(msg), { status: 502, googleStatus: s, url });
}

// ── Places Nearby Search ──────────────────────────────────────────────────────

async function searchNearby({ lat, lng, radius = 20000, type = 'campground', keyword = '', language = 'fr' }) {
  checkKey();
  const params = {
    location: `${lat},${lng}`,
    radius,
    language,
    key: KEY(),
  };
  // type optionnel : si non fourni (ex: recherche de sentiers), ne pas le mettre pour élargir les résultats
  if (type) params.type = type;
  if (keyword) params.keyword = keyword;

  const url  = `${BASE}/place/nearbysearch/json`;
  const resp = await axios.get(url, { params });
  const err  = gmError(resp.data, url);
  if (err) throw err;

  return resp.data.results.map(normalizePlaceResult);
}

// ── Places Text Search ────────────────────────────────────────────────────────

async function searchText({ query, location, radius = 30000, language = 'fr' }) {
  checkKey();
  const params = { query, language, key: KEY() };
  if (location) {
    params.location = `${location.lat},${location.lng}`;
    params.radius   = radius;
  }
  const url  = `${BASE}/place/textsearch/json`;
  const resp = await axios.get(url, { params });
  const err  = gmError(resp.data, url);
  if (err) throw err;
  return resp.data.results.map(normalizePlaceResult);
}

// ── Place Autocomplete (NEW API v1) ──────────────────────────────────────────

async function autocomplete({ input, sessionToken, location, radius = 50000, language = 'fr', types = '' }) {
  checkKey();
  
  const body = {
    input,
    languageCode: language === 'fr' ? 'fr' : 'en',
  };
  
  if (sessionToken) body.sessionToken = sessionToken;
  
  if (location) {
    body.locationBias = {
      circle: {
        center: { latitude: location.lat, longitude: location.lng },
        radius: radius,
      },
    };
  }

  const url = 'https://places.googleapis.com/v1/places:autocomplete';
  
  try {
    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
      },
    });
    
    // Transformer les suggestions en format compatible (mainText, secondaryText)
    return (resp.data.suggestions || []).map(sugg => {
      const pp = sugg.placePrediction || {};
      const text = pp.text?.text || '';
      const structured = pp.structuredFormat || {};
      const mainText = structured.mainText?.text || '';
      const secondaryText = structured.secondaryText?.text || '';
      console.log(`[googleMaps] Prediction: placeId=${pp.placeId}, text="${text.slice(0, 50)}", main="${mainText.slice(0, 50)}", secondary="${secondaryText.slice(0, 50)}"`);
      return {
        place_id: pp.placeId,
        description: mainText || text,  // Utiliser mainText si dispo, sinon le texte complet
        main_text: mainText,
        secondary_text: secondaryText,
        types: pp.types || [],
      };
    });
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      throw Object.assign(
        new Error('Clé API Google refusée ou non activée pour ce service.'),
        { status: 502, googleStatus: 'REQUEST_DENIED', url }
      );
    }
    throw err;
  }
}

// ── Place Details ─────────────────────────────────────────────────────────────

async function getPlaceDetails({ placeId, sessionToken, language = 'fr' }) {
  checkKey();
  
  // Places API v1 utilise GET avec field masking en header
  // placeId doit être préfixé par "places/", le champ coords s'appelle "location" (pas "geometry")
  const resourceName = `places/${placeId}`;
  const url = `https://places.googleapis.com/v1/${resourceName}`;
  
  try {
    const resp = await axios.get(url, {
      headers: {
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'displayName,formattedAddress,location,types',
      },
    });
    
    const place = resp.data;
    
    return {
      placeId,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      types: place.types || [],
    };
  } catch (err) {
    console.error('[getPlaceDetails] Error:', JSON.stringify(err.response?.data || err.message, null, 2));
    if (err.response?.status === 403 || err.response?.status === 401) {
      throw Object.assign(
        new Error('Clé API Google refusée ou non activée pour ce service.'),
        { status: 502, googleStatus: 'REQUEST_DENIED', url }
      );
    }
    throw err;
  }
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

async function geocode({ address, language = 'fr' }) {
  checkKey();
  const resp = await axios.get(`${BASE}/geocode/json`, {
    params: { address, language, key: KEY() },
  });
  const err = gmError(resp.data, `${BASE}/geocode/json`);
  if (err) throw err;
  const r = resp.data.results[0];
  if (!r) return null;
  return {
    lat:     r.geometry.location.lat,
    lng:     r.geometry.location.lng,
    address: r.formatted_address,
    placeId: r.place_id,
  };
}

// ── Reverse Geocoding ─────────────────────────────────────────────────────────

async function reverseGeocode({ lat, lng, language = 'fr' }) {
  checkKey();
  const resp = await axios.get(`${BASE}/geocode/json`, {
    params: { latlng: `${lat},${lng}`, language, key: KEY() },
  });
  const err = gmError(resp.data, `${BASE}/geocode/json`);
  if (err) throw err;
  const r = resp.data.results[0];
  return r ? { address: r.formatted_address, placeId: r.place_id } : null;
}

// ── Directions ────────────────────────────────────────────────────────────────

async function getDirections({ origin, destination, waypoints = [], mode = 'driving', language = 'fr' }) {
  checkKey();
  const params = {
    origin:      typeof origin      === 'string' ? origin      : `${origin.lat},${origin.lng}`,
    destination: typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`,
    mode,
    language,
    key: KEY(),
  };
  if (waypoints.length) {
    params.waypoints = waypoints
      .map(w => typeof w === 'string' ? w : `${w.lat},${w.lng}`)
      .join('|');
  }

  const url  = `${BASE}/directions/json`;
  const resp = await axios.get(url, { params });
  const err  = gmError(resp.data, url);
  if (err) throw err;

  const route = resp.data.routes[0];
  if (!route) return null;

  const legs = route.legs.map(leg => ({
    startAddress: leg.start_address,
    endAddress:   leg.end_address,
    distance:     { value: leg.distance.value, text: leg.distance.text },
    duration:     { value: leg.duration.value, text: leg.duration.text },
    steps:        leg.steps.map(s => ({
      instruction: s.html_instructions.replace(/<[^>]*>/g, ''),
      distance:    s.distance.text,
      duration:    s.duration.text,
      maneuver:    s.maneuver || '',
    })),
  }));

  // Decode polyline pour la carte
  const polyline = route.overview_polyline.points;

  return {
    summary:        route.summary,
    totalDistance:  legs.reduce((sum, l) => sum + l.distance.value, 0) / 1000, // km
    totalDuration:  legs.reduce((sum, l) => sum + l.duration.value, 0),        // seconds
    legs,
    polyline,
    bounds: route.bounds,
  };
}

// ── Elevation ─────────────────────────────────────────────────────────────────

async function getElevation({ path, samples = 100 }) {
  checkKey();
  // path: array of {lat, lng}
  const pathStr = path.map(p => `${p.lat},${p.lng}`).join('|');
  const resp = await axios.get(`${BASE}/elevation/json`, {
    params: {
      path:    pathStr,
      samples: Math.min(samples, 512),
      key:     KEY(),
    },
  });
  const err = gmError(resp.data, `${BASE}/elevation/json`);
  if (err) throw err;

  return resp.data.results.map(r => ({
    lat:       r.location.lat,
    lng:       r.location.lng,
    elevation: Math.round(r.elevation),
  }));
}

// ── New Google Places API v1 ─────────────────────────────────────────────────

/**
 * Recherche de lieux à proximité via la nouvelle API Google Places v1.
 * @param {Object} opts - { lat, lng, radius, includedTypes: [String], maxResultCount, languageCode }
 */
async function searchNearbyV1({ lat, lng, radius = 5000, includedTypes = [], maxResultCount = 6, languageCode = 'fr' }) {
  checkKey();
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius,
      },
    },
    includedTypes: includedTypes.length > 0 ? includedTypes : undefined,
    maxResultCount,
    languageCode,
  };

  try {
    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.formattedAddress,places.location',
      },
    });
    
    return (resp.data.places || []).map(p => ({
      placeId:          p.id,
      name:             p.displayName?.text || '',
      address:          p.formattedAddress || '',
      lat:              p.location?.latitude,
      lng:              p.location?.longitude,
      rating:           p.rating,
      userRatingCount:  p.userRatingCount,
      types:            [],
      photos:           p.photos?.slice(0, 1).map(ph => ph.name) || [],
    }));
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw Object.assign(new Error(`Google Places API v1 searchNearby: ${msg}`), { status: 502 });
  }
}

/**
 * Recherche textuelle via la nouvelle API Google Places v1.
 * @param {Object} opts - { textQuery, includedType, maxResultCount, languageCode, locationBias }
 */
async function searchTextV1({ textQuery, includedType, maxResultCount = 20, languageCode = 'fr', locationBias }) {
  checkKey();
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery,
    includedType: includedType || undefined,
    maxResultCount,
    languageCode,
    locationBias: locationBias || undefined,
  };

  try {
    const resp = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.formattedAddress,places.location',
      },
    });
    
    return (resp.data.places || []).map(p => ({
      placeId:          p.id,
      name:             p.displayName?.text || '',
      address:          p.formattedAddress || '',
      lat:              p.location?.latitude,
      lng:              p.location?.longitude,
      rating:           p.rating,
      userRatingCount:  p.userRatingCount,
      types:            [],
      photos:           p.photos?.slice(0, 1).map(ph => ph.name) || [],
    }));
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw Object.assign(new Error(`Google Places API v1 searchText: ${msg}`), { status: 502 });
  }
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizePlaceResult(p) {
  return {
    placeId:          p.place_id,
    name:             p.name,
    address:          p.formatted_address || p.vicinity,
    lat:              p.geometry.location.lat,
    lng:              p.geometry.location.lng,
    rating:           p.rating,
    userRatingsTotal: p.user_ratings_total,
    types:            p.types || [],
    openNow:          p.opening_hours?.open_now,
    priceLevel:       p.price_level,
    photo:            p.photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${KEY()}`
      : null,
  };
}

function normalizeDetails(d) {
  return {
    placeId:        d.place_id,
    name:           d.name,
    address:        d.formatted_address,
    lat:            d.geometry?.location?.lat,
    lng:            d.geometry?.location?.lng,
    rating:         d.rating,
    userRatingsTotal: d.user_ratings_total,
    website:        d.website,
    phone:          d.international_phone_number,
    types:          d.types || [],
    url:            d.url,
    vicinity:       d.vicinity,
    priceLevel:     d.price_level,
    openingHours:   d.opening_hours?.weekday_text,
    isOpen:         d.opening_hours?.open_now,
    photos: (d.photos || []).slice(0, 5).map(ph =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ph.photo_reference}&key=${KEY()}`
    ),
    reviews: (d.reviews || []).slice(0, 3).map(r => ({
      author:   r.author_name,
      rating:   r.rating,
      text:     r.text,
      time:     r.relative_time_description,
    })),
  };
}

module.exports = {
  searchNearby,
  searchText,
  autocomplete,
  getPlaceDetails,
  geocode,
  reverseGeocode,
  getDirections,
  getElevation,
  searchNearbyV1,
  searchTextV1,
};
