import api from '../api.js';

function formatDuration(seconds) {
  const s = parseInt(seconds, 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function formatDistance(meters) {
  if (!meters) return '';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(0)} km`;
}

/**
 * Calcule l'itinéraire entre deux points via le proxy backend (Google Routes API v2).
 */
export async function computeRoute(origin, destination) {
  if (!origin?.lat || !destination?.lat) return null;
  try {
    const { data } = await api.post('/routes/compute', { origin, destination, alternatives: false });
    const route = data.routes?.[0];
    if (!route) return null;
    const durationSeconds = parseInt(route.duration, 10);
    return {
      durationSeconds,
      durationText: formatDuration(durationSeconds),
      distanceMeters: route.distanceMeters,
      distanceText: formatDistance(route.distanceMeters),
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Calcule plusieurs itinéraires alternatifs entre deux points.
 */
export async function computeRouteAlternatives(origin, destination) {
  if (!origin?.lat || !destination?.lat) return [];
  try {
    const { data } = await api.post('/routes/compute', { origin, destination, alternatives: true });
    return (data.routes ?? []).map((route) => {
      const durationSeconds = parseInt(route.duration, 10);
      return {
        durationSeconds,
        durationText: formatDuration(durationSeconds),
        distanceMeters: route.distanceMeters,
        distanceText: formatDistance(route.distanceMeters),
        encodedPolyline: route.polyline?.encodedPolyline ?? null,
        description: route.description ?? null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Géocode inverse : convertit des coordonnées en adresse lisible.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const { data } = await api.get(`/routes/geocode?latlng=${lat},${lng}`);
    return data.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

/**
 * Calcule toutes les routes entre des étapes consécutives (celles ayant des coordonnées GPS).
 * Retourne un objet indexé par "fromStepId→toStepId".
 */
export async function computeAllRoutes(steps) {
  const geoSteps = steps.filter(
    (s) => s.latitude != null && s.longitude != null &&
      !isNaN(parseFloat(s.latitude)) && !isNaN(parseFloat(s.longitude))
  );

  const results = {};
  const promises = [];

  for (let i = 0; i < geoSteps.length - 1; i++) {
    const from = geoSteps[i];
    const to = geoSteps[i + 1];
    const key = `${from.id}→${to.id}`;
    promises.push(
      computeRoute(
        { lat: parseFloat(from.latitude), lng: parseFloat(from.longitude) },
        { lat: parseFloat(to.latitude), lng: parseFloat(to.longitude) }
      ).then((route) => {
        if (route) results[key] = route;
      })
    );
  }

  await Promise.all(promises);
  return results;
}
