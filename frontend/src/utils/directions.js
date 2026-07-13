import client from '../api/client';

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
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ durationText: string, distanceText: string } | null>}
 */
export async function computeRoute(origin, destination) {
  if (!origin?.lat || !destination?.lat) return null;
  try {
    const { data } = await client.post('/api/routes/compute', {
      origin,
      destination,
      alternatives: false,
    });
    const route = data.routes?.[0];
    if (!route) return null;
    const durationSeconds = parseInt(route.duration, 10);
    return {
      durationSeconds,
      durationText: formatDuration(durationSeconds),
      distanceMeters: route.distanceMeters,
      distanceText: formatDistance(route.distanceMeters),
    };
  } catch {
    return null;
  }
}
