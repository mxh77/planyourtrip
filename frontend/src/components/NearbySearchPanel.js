import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import PlaceDetailModal from './PlaceDetailModal';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK = 'places.id,places.displayName,places.rating,places.photos,places.formattedAddress,places.types';

const TYPE_ICON_MAP = [
  ['hotel', '🏨'],
  ['motel', '🏩'],
  ['campground', '⛺'],
  ['bed_and_breakfast', '🛏️'],
  ['restaurant', '🍽️'],
  ['cafe', '☕'],
  ['bar', '🍺'],
  ['tourist_attraction', '🎭'],
  ['museum', '🏛️'],
  ['park', '🌳'],
  ['amusement_park', '🎡'],
  ['aquarium', '🐟'],
  ['zoo', '🦁'],
  ['art_gallery', '🖼️'],
  ['shopping_mall', '🛍️'],
  ['department_store', '🛍️'],
  ['supermarket', '🛒'],
  ['gas_station', '⛽'],
  ['pharmacy', '💊'],
  ['hospital', '🏥'],
  ['spa', '💆'],
  ['gym', '🏋️'],
  ['fitness_center', '🏋️'],
];

function getPlaceIcon(types = []) {
  for (const [type, icon] of TYPE_ICON_MAP) {
    if (types.includes(type)) return icon;
  }
  return '📍';
}

const DEFAULT_TYPES = ['hotel', 'campground', 'restaurant', 'cultural_center', 'museum', 'park'];
const DEFAULT_RADIUS = 1000;
const LODGING_TYPES = ['hotel', 'motel', 'campground', 'rv_park', 'bed_and_breakfast', 'hostel'];

// Mapping de rétro-compatibilité : anciens types (avant migration Places API v1) → nouveaux
const LEGACY_TYPE_MAP = {
  lodging: 'hotel',
  tourist_attraction: 'cultural_center',
  shopping_mall: 'department_store',
  shopping_center: 'department_store',
};

function normalizeTypes(types) {
  return [...new Set(types.map(t => LEGACY_TYPE_MAP[t] ?? t))];
}

// Appel à la nouvelle Places API v1 avec includedTypes
async function fetchNearbyV1(latitude, longitude, radius, includedTypes) {
  if (!includedTypes || includedTypes.length === 0) return [];
  const res = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius,
        },
      },
      languageCode: 'fr',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    console.warn('[NearbySearch] API error', res.status, msg, '| types:', includedTypes.join(','));
    throw new Error(msg);
  }
  return data.places ?? [];
}

export default function NearbySearchPanel({ latitude, longitude, stepId, roadtripId, allowedTypes, radius, stepStartDate, stepArrivalTime }) {
  const [lodgingPlaces, setLodgingPlaces] = useState([]);
  const [activityPlaces, setActivityPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);

  const baseTypes = normalizeTypes(
    (allowedTypes && allowedTypes.length > 0) ? allowedTypes : DEFAULT_TYPES
  );
  const effectiveRadius = radius ?? DEFAULT_RADIUS;

  const lodgingTypes = baseTypes.filter(t => LODGING_TYPES.includes(t));
  const activityTypes = baseTypes.filter(t => !LODGING_TYPES.includes(t));

  console.log('[NearbySearch] baseTypes:', baseTypes.join(','));
  console.log('[NearbySearch] lodgingTypes:', lodgingTypes.join(','), '| activityTypes:', activityTypes.join(','));

  // Pour un STOP, on ne charge pas les hébergements
  const fetchLodging = lodgingTypes.length > 0;

  useEffect(() => {
    if (!latitude || !longitude) return;
    setLoading(true);
    setError(null);
    setLodgingPlaces([]);
    setActivityPlaces([]);

    const run = async () => {
      try {
        const [lodgingResult, activityResult] = await Promise.allSettled([
          fetchLodging
            ? fetchNearbyV1(latitude, longitude, effectiveRadius, lodgingTypes)
            : Promise.resolve([]),
          activityTypes.length > 0
            ? fetchNearbyV1(latitude, longitude, effectiveRadius, activityTypes)
            : Promise.resolve([]),
        ]);

        setLodgingPlaces(lodgingResult.status === 'fulfilled' ? lodgingResult.value.slice(0, 5) : []);
        setActivityPlaces(activityResult.status === 'fulfilled' ? activityResult.value.slice(0, 5) : []);

        // Logger les erreurs individuelles pour diagnostic
        if (lodgingResult.status === 'rejected') {
          console.warn('[NearbySearch] lodging request failed:', lodgingResult.reason?.message);
        }
        if (activityResult.status === 'rejected') {
          console.warn('[NearbySearch] activity request failed:', activityResult.reason?.message);
        }
        // Afficher une erreur globale seulement si les DEUX échouent
        if (lodgingResult.status === 'rejected' && activityResult.status === 'rejected') {
          const msg = activityResult.reason?.message ?? lodgingResult.reason?.message ?? 'Erreur API';
          setError(msg);
        }
      } catch {
        setError('Erreur de connexion.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [latitude, longitude, effectiveRadius, baseTypes.join(',')]);

  if (!latitude || !longitude) return null;

  const radiusLabel = effectiveRadius >= 1000 ? `${effectiveRadius / 1000} km` : `${effectiveRadius} m`;
  const showLodging = fetchLodging && lodgingPlaces.length > 0;
  const showActivity = activityPlaces.length > 0;
  const isEmpty = !loading && !error && !showLodging && !showActivity;

  const renderCard = (item) => {
    // Nouvelle API : id, displayName.text, formattedAddress, photos[].name
    const photoName = item.photos?.[0]?.name;
    const photoUri = photoName
      ? `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=340&key=${API_KEY}`
      : null;
    const name = item.displayName?.text ?? '—';
    const address = item.formattedAddress ?? null;
    const placeId = item.id;
    return (
      <TouchableOpacity
        key={placeId}
        style={styles.card}
        onPress={() => setSelectedPlaceId(placeId)}
        activeOpacity={0.75}
      >
        <View style={styles.cardPhotoContainer}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.cardPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.cardPhotoPlaceholder}>
              <Text style={styles.cardIcon}>{getPlaceIcon(item.types)}</Text>
            </View>
          )}
          {item.rating != null ? (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeText}>⭐ {item.rating}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{name}</Text>
          {address ? (
            <Text style={styles.cardVicinity} numberOfLines={1}>{address}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.panelTitle}>🔍 Suggestions · {radiusLabel}</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : isEmpty ? (
        <Text style={styles.emptyText}>Aucun lieu trouvé dans un rayon de {radiusLabel}.</Text>
      ) : (
        <>
          {/* ── Hébergements ─────────────────────────────────────────── */}
          {showLodging && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>🏨 Hébergements</Text>
              <FlatList
                data={lodgingPlaces}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => renderCard(item)}
              />
            </View>
          )}

          {/* ── Activités & lieux ─────────────────────────────────────── */}
          {showActivity && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>📍 Activités & lieux</Text>
              <FlatList
                data={activityPlaces}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => renderCard(item)}
              />
            </View>
          )}
        </>
      )}

      {selectedPlaceId ? (
        <PlaceDetailModal
          placeId={selectedPlaceId}
          stepId={stepId}
          roadtripId={roadtripId}
          stepStartDate={stepStartDate}
          stepArrivalTime={stepArrivalTime}
          onClose={() => setSelectedPlaceId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  panelTitle: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  group: {
    marginBottom: SPACING.md,
  },
  groupLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  loader: {
    marginVertical: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  list: {
    gap: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  card: {
    width: 170,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardPhotoContainer: {
    width: '100%',
    height: 100,
    position: 'relative',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  cardPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 28,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    padding: SPACING.sm,
  },
  cardName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 2,
  },
  cardRating: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  cardVicinity: {
    color: COLORS.textDim,
    fontSize: 11,
  },
});
