/**
 * trails.js — Recherche de sentiers de randonnée
 * Sources : Overpass API (OSM) + OpenRouteService
 */
const axios = require('axios');
const googleMaps = require('./googleMaps');

// ── Overpass API (OpenStreetMap) ───────────────────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Recherche les sentiers de randonnée via OpenStreetMap/Overpass
 */
async function searchTrailsOSM(lat, lng, radius = 15000) {
  const query = `
[out:json][timeout:30];
(
  relation["type"="route"]["route"="hiking"](around:${radius},${lat},${lng});
  relation["type"="route"]["route"="foot"](around:${radius},${lat},${lng});
  relation["type"="route"]["route"="mtb"](around:${radius},${lat},${lng});
  way["highway"="path"]["name"][!"piste:type"]["sport"!="skiing"]["access"!="ski"](around:${radius},${lat},${lng});
  way["highway"="footway"]["name"][!"piste:type"]["sport"!="skiing"](around:${radius},${lat},${lng});
  way["highway"="track"]["name"]["sac_scale"][!"piste:type"](around:${radius},${lat},${lng});
);
out body center tags;
`;

  try {
    const resp = await axios.get(OVERPASS_URL, {
      params: { data: query },
      headers: { 'Accept': '*/*', 'User-Agent': 'RoadTripPlanner/1.0' },
      timeout: 30000,
    });

    const elements = resp.data?.elements || [];

    const trails = elements
      .filter(e => e.tags)
      .filter(e => !e.tags['piste:type'] && e.tags['route'] !== 'ski' && e.tags['sport'] !== 'skiing')
      .map(e => {
        const tags = e.tags;
        const center = e.center || (e.lat && e.lon ? { lat: e.lat, lon: e.lon } : null);

        // Durée estimée (si connue)
        const distanceKm  = parseTagDistance(tags['distance'] || tags['length']);
        const ascent      = parseInt(tags['ascent'] || tags['ele_gain'] || '0') || 0;
        const descent     = parseInt(tags['descent'] || '0') || 0;
        const difficulty  = normalizeSacScale(tags['sac_scale']);
        const estMinutes  = estimateDuration(distanceKm, ascent, difficulty);

        return {
          id:          `osm_${e.type}_${e.id}`,
          osmType:     e.type,
          osmId:       e.id,
          name:        tags.name || tags['name:fr'] || tags['name:es'] || 'Sentier sans nom',
          description: tags.description || tags.note || '',
          lat:         center?.lat || lat,
          lng:         center?.lon || lng,
          distance:    distanceKm,
          ascent,
          descent,
          difficulty,
          difficultyLabel: DIFFICULTY_LABELS[difficulty] || difficulty || 'Inconnue',
          duration:    estMinutes,
          durationLabel: formatDuration(estMinutes),
          color:       DIFFICULTY_COLORS[difficulty] || '#6b7280',
          network:     tags.network,
          operator:    tags.operator,
          website:     tags.website || tags.url,
          osmUrl:      `https://www.openstreetmap.org/${e.type}/${e.id}`,
          waymarkedUrl: e.type === 'relation'
            ? `https://hiking.waymarkedtrails.org/#route?id=${e.id}&map=14!${center?.lat || lat}!${center?.lon || lng}`
            : `https://hiking.waymarkedtrails.org/#?map=14!${center?.lat || lat}!${center?.lon || lng}`,
          tags,
        };
      })
      .filter(t => t.name !== 'Sentier sans nom' || t.distance)
      // Priorité aux relations (itinéraires nommés) puis aux ways
      .sort((a, b) => {
        if (a.osmType === 'relation' && b.osmType !== 'relation') return -1
        if (a.osmType !== 'relation' && b.osmType === 'relation') return 1
        return (b.distance || 0) - (a.distance || 0)
      })
      .slice(0, 30);

    return { source: 'osm', count: trails.length, trails };
  } catch (e) {
    console.error('[trails] Overpass error:', e.message);
    return { source: 'osm', count: 0, trails: [], error: e.message };
  }
}

// ── OpenRouteService ──────────────────────────────────────────────────────────

/**
 * Calcule un itinéraire pédestre/vélo via OpenRouteService
 */
async function getOrsRoute({ coordinates, profile = 'foot-hiking' }) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return { error: 'ORS_API_KEY non configurée' };

  const url = `https://api.openrouteservice.org/v2/directions/${profile}`;
  try {
    const resp = await axios.post(
      url,
      {
        coordinates, // [[lng, lat], ...]
        elevation:   true,
        instructions: true,
        language:    'fr',
      },
      {
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const route = resp.data.routes?.[0];
    if (!route) return { error: 'Aucun itinéraire trouvé' };

    const summary = route.summary;
    return {
      source:        'ors',
      profile,
      distance:      summary.distance / 1000, // km
      duration:      Math.round(summary.duration / 60), // minutes
      ascent:        route.segments?.[0]?.ascent || 0,
      descent:       route.segments?.[0]?.descent || 0,
      geometry:      route.geometry, // encoded polyline
      wayPoints:     route.way_points,
    };
  } catch (e) {
    return { source: 'ors', error: e.response?.data?.error?.message || e.message };
  }
}

/**
 * Isochrone : zone accessible à pied/vélo en X minutes depuis un point
 */
async function getIsochrone({ lat, lng, minutes = 30, profile = 'foot-hiking' }) {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return { error: 'ORS_API_KEY non configurée' };

  const url = `https://api.openrouteservice.org/v2/isochrones/${profile}`;
  try {
    const resp = await axios.post(
      url,
      {
        locations:   [[lng, lat]],
        range:       [minutes * 60],
        range_type:  'time',
        smoothing:   5,
      },
      {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return resp.data;
  } catch (e) {
    return { error: e.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAC_SCALE_MAP = {
  'hiking':                  'easy',
  'mountain_hiking':         'moderate',
  'demanding_mountain_hiking': 'hard',
  'alpine_hiking':           'expert',
  'demanding_alpine_hiking': 'expert',
  'difficult_alpine_hiking': 'expert',
};

const DIFFICULTY_LABELS = {
  easy:     'Facile',
  moderate: 'Modéré',
  hard:     'Difficile',
  expert:   'Expert',
};

const DIFFICULTY_COLORS = {
  easy:     '#22c55e',
  moderate: '#f59e0b',
  hard:     '#ef4444',
  expert:   '#7c3aed',
};

function normalizeSacScale(sacScale) {
  if (!sacScale) return 'unknown';
  return SAC_SCALE_MAP[sacScale.toLowerCase()] || 'moderate';
}

function parseTagDistance(value) {
  if (!value) return null;
  const n = parseFloat(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return null;
  // Si la valeur semble être en mètres (> 100), convertir en km
  return value.includes('m') && !value.includes('km') ? n / 1000 : n;
}

function estimateDuration(distanceKm, ascent, difficulty) {
  if (!distanceKm) return null;
  // Formule Naismith : 5 km/h + 10 min/100m de dénivelé
  let speedKmH = { easy: 4, moderate: 3, hard: 2.5, expert: 2 }[difficulty] || 3;
  const hours  = distanceKm / speedKmH + (ascent / 600); // 600m dénivelé = 1h
  return Math.round(hours * 60);
}

function formatDuration(minutes) {
  if (!minutes) return 'Durée inconnue';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m} min`;
}

// ── Google Places — Circuits de randonnée ─────────────────────────────────────

/**
 * Recherche de randonnées via Google Places (mêmes résultats que Google Maps)
 */
async function searchTrailsGoogle(lat, lng, radius = 15000) {
  try {
    const KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!KEY) return [];

    // Deux requêtes en parallèle : hiking anglais + sentiero/randonnée local
    const [hikingRes, sentierRes] = await Promise.allSettled([
      googleMaps.searchNearby({
        lat, lng, radius,
        type: null,
        keyword: 'hiking trail',
        language: 'fr',
      }),
      googleMaps.searchNearby({
        lat, lng, radius,
        type: null,
        keyword: 'sentiero randonnée circuit',
        language: 'fr',
      }),
    ]);

    const seen = new Set();
    const results = [];

    const allPlaces = [
      ...(hikingRes.status === 'fulfilled' ? hikingRes.value : []),
      ...(sentierRes.status  === 'fulfilled' ? sentierRes.value  : []),
    ];

    for (const p of allPlaces) {
      if (seen.has(p.placeId)) continue;
      seen.add(p.placeId);

      results.push({
        id:             `google_${p.placeId}`,
        source:         'google',
        googlePlaceId:  p.placeId,
        name:           p.name,
        description:    '',
        lat:            p.lat,
        lng:            p.lng,
        distance:       null,
        ascent:         null,
        descent:        null,
        difficulty:     'unknown',
        difficultyLabel: 'Inconnue',
        duration:       null,
        durationLabel:  'Durée inconnue',
        color:          '#64748b',
        rating:         p.rating,
        userRatingsTotal: p.userRatingsTotal,
        photo:          p.photo,
        website:        null,
        osmUrl:         null,
        waymarkedUrl:   null,
        gmapsUrl:       `https://www.google.com/maps/place/?q=place_id:${p.placeId}`,
      });
    }

    return results.slice(0, 20);
  } catch (e) {
    console.error('[trails] Google Places error:', e.message);
    return [];
  }
}

// ── Recherche combinée OSM + Google ────────────────────────────────────────────

async function searchTrails(lat, lng, radius = 15000) {
  const [osmResult, googleTrails] = await Promise.allSettled([
    searchTrailsOSM(lat, lng, radius),
    searchTrailsGoogle(lat, lng, radius),
  ]);

  const osmTrails = osmResult.status === 'fulfilled'
    ? (osmResult.value.trails || [])
    : [];
  const gTrails = googleTrails.status === 'fulfilled'
    ? googleTrails.value
    : [];

  // Dédupliquer : si un sentier OSM a le même nom (± tolérance) qu'un Google, garder OSM
  const osmNames = new Set(osmTrails.map(t => t.name.toLowerCase().trim()));
  const uniqueGoogle = gTrails.filter(g => !osmNames.has(g.name.toLowerCase().trim()));

  // Google en premier (mêmes résultats que Google Maps), puis OSM avec données techniques
  const merged = [...uniqueGoogle, ...osmTrails];

  return {
    source: 'combined',
    count:  merged.length,
    trails: merged,
    sources: {
      google: uniqueGoogle.length,
      osm:    osmTrails.length,
    },
  };
}

module.exports = {
  searchTrailsOSM,
  searchTrailsGoogle,
  searchTrails,
  getOrsRoute,
  getIsochrone,
  formatDuration,
};
