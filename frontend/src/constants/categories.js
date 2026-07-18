// ─── Catalogue complet des catégories de recherche rapide ────────────────
// Chaque catégorie peut être activée/désactivée depuis l'écran Paramètres.
// Les catégories marquées default:true sont activées par défaut.

const ALL_CATEGORIES = [
  // ── Catégories principales (activées par défaut) ──
  {
    key: 'campings',
    icon: '🏕️',
    label: 'Campings',
    googleTypes: ['campground', 'rv_park'],
    includeP4N: true,
    p4nTypes: [9],
    default: true,
  },
  {
    key: 'trails',
    icon: '🥾',
    label: 'Randonnées',
    googleTypes: ['hiking_area', 'park'],
    includeP4N: false,
    p4nTypes: [],
    default: true,
  },
  {
    key: 'p4n',
    icon: '🅿️',
    label: 'Park4Night',
    googleTypes: [],
    includeP4N: true,
    p4nTypes: [7, 8, 10, 12, 14, 57],
    default: true,
  },
  {
    key: 'pois',
    icon: '📍',
    label: 'Activités',
    googleTypes: ['tourist_attraction', 'museum', 'amusement_park'],
    includeP4N: false,
    p4nTypes: [],
    default: true,
  },
  {
    key: 'restaurant',
    icon: '🍽️',
    label: 'Restaurants',
    googleTypes: ['restaurant', 'cafe', 'bar'],
    includeP4N: false,
    p4nTypes: [],
    default: true,
  },
  {
    key: 'hotel',
    icon: '🏨',
    label: 'Hôtels',
    googleTypes: ['lodging', 'hotel', 'motel', 'bed_and_breakfast'],
    includeP4N: false,
    p4nTypes: [],
    default: true,
  },

  // ── Catégories supplémentaires (désactivées par défaut) ──
  {
    key: 'supermarket',
    icon: '🛒',
    label: 'Supermarchés',
    googleTypes: ['supermarket', 'convenience_store'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
  {
    key: 'culture',
    icon: '🎭',
    label: 'Culture',
    googleTypes: ['museum', 'art_gallery', 'cultural_center'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
  {
    key: 'transport',
    icon: '🚌',
    label: 'Transports',
    googleTypes: ['bus_station', 'train_station', 'transit_station'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
  {
    key: 'bar',
    icon: '🍺',
    label: 'Bars & Pubs',
    googleTypes: ['bar'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
  {
    key: 'parking',
    icon: '🅿️',
    label: 'Parkings',
    googleTypes: ['parking'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
  {
    key: 'gym',
    icon: '🏋️',
    label: 'Sport / Gym',
    googleTypes: ['gym'],
    includeP4N: false,
    p4nTypes: [],
    default: false,
  },
];

export default ALL_CATEGORIES;

/**
 * Retourne les catégories activées.
 * @param {string[]} enabledKeys - Tableau des keys activées (depuis les settings).
 * @param {boolean} [useDefaults] - Si true et qu'aucun enabledKeys n'est fourni, utilise les defaults.
 * @returns {object[]} Catégories filtrées.
 */
export function getEnabledCategories(enabledKeys, useDefaults = true) {
  if (!enabledKeys || enabledKeys.length === 0) {
    if (useDefaults) {
      return ALL_CATEGORIES.filter((c) => c.default);
    }
    return [];
  }
  return ALL_CATEGORIES.filter((c) => enabledKeys.includes(c.key));
}
