import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Linking, Image, Alert, FlatList, Dimensions,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useRoadtripStore } from '../store/roadtripStore';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const PHOTO_WIDTH = Dimensions.get('window').width;

const PRICE_LEVEL = ['', '€', '€€', '€€€', '€€€€'];

const LODGING_TYPES = ['lodging', 'campground', 'rv_park', 'motel'];

const ACTIVITY_TYPES = [
  'tourist_attraction', 'museum', 'amusement_park', 'aquarium', 'art_gallery',
  'bowling_alley', 'casino', 'movie_theater', 'night_club', 'park', 'zoo',
  'spa', 'stadium',
];

function isLodging(types = []) {
  return types.some(t => LODGING_TYPES.includes(t));
}

function isActivity(types = []) {
  return types.some(t => ACTIVITY_TYPES.includes(t));
}

export default function PlaceDetailModal({ placeId, stepId, roadtripId, stepStartDate, stepArrivalTime, onClose }) {
  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // 'accommodation' | 'activity' | null
  const [photoIndex, setPhotoIndex] = useState(0);

  const { createAccommodation, createActivity } = useRoadtripStore();

  useEffect(() => {
    if (!placeId) return;
    setLoading(true);
    setPlace(null);
    setPhotoIndex(0);
    fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,formatted_address,formatted_phone_number,website,opening_hours,photos,geometry,price_level,types&language=fr&key=${API_KEY}`
    )
      .then(res => res.json())
      .then(data => {
        if (data.status === 'OK') setPlace(data.result);
        else setPlace(null);
      })
      .catch(() => setPlace(null))
      .finally(() => setLoading(false));
  }, [placeId]);

  const photoRefs = (place?.photos ?? []).slice(0, 6).map(p => p.photo_reference);
  const photoUrls = photoRefs.map(
    ref => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${API_KEY}`
  );

  const handleAddAccommodation = async () => {
    if (!stepId) {
      Alert.alert('Étape requise', "Enregistrez d'abord l'étape avant d'ajouter un hébergement.");
      return;
    }
    setAdding('accommodation');
    // Pré-remplir avec la date/heure d'arrivée de l'étape
    const defaultTime = stepArrivalTime || '10:00';
    const checkIn = stepStartDate ? `${stepStartDate} ${defaultTime}` : null;
    const checkOut = stepStartDate ? `${stepStartDate} ${defaultTime}` : null;
    try {
      await createAccommodation({
        name: place.name,
        address: place.formatted_address ?? null,
        latitude: place.geometry?.location?.lat ?? null,
        longitude: place.geometry?.location?.lng ?? null,
        checkIn,
        checkOut,
        stepId,
        roadtripId,
      });
      Alert.alert('✅ Hébergement ajouté', `« ${place.name} » a été ajouté à votre étape.`);
      onClose();
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter l'hébergement.");
    } finally {
      setAdding(null);
    }
  };

  const handleAddActivity = async () => {
    if (!stepId) {
      Alert.alert('Étape requise', "Enregistrez d'abord l'étape avant d'ajouter une activité.");
      return;
    }
    setAdding('activity');
    // Pré-remplir avec la date/heure d'arrivée de l'étape
    const defaultTime = stepArrivalTime || '10:00';
    const startTime = stepStartDate ? `${stepStartDate} ${defaultTime}` : null;
    const endTime = stepStartDate ? `${stepStartDate} ${defaultTime}` : null;
    try {
      await createActivity({
        name: place.name,
        location: place.formatted_address ?? null,
        startTime,
        endTime,
        stepId,
        roadtripId,
      });
      Alert.alert('✅ Activité ajoutée', `« ${place.name} » a été ajoutée à votre étape.`);
      onClose();
    } catch {
      Alert.alert('Erreur', "Impossible d'ajouter l'activité.");
    } finally {
      setAdding(null);
    }
  };

  const lodging = place ? isLodging(place.types) : false;
  const activity = place ? (isActivity(place.types) || !lodging) : false;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={COLORS.accent} size="large" />
            </View>
          ) : !place ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Impossible de charger ce lieu.</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {/* ── Carrousel photos ── */}
              {photoUrls.length > 0 ? (
                <View>
                  <FlatList
                    data={photoUrls}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, i) => String(i)}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / PHOTO_WIDTH);
                      setPhotoIndex(idx);
                    }}
                    renderItem={({ item }) => (
                      <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
                    )}
                  />
                  {/* Points indicateurs */}
                  {photoUrls.length > 1 ? (
                    <View style={styles.dots}>
                      {photoUrls.map((_, i) => (
                        <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.content}>
                {/* Nom + note + prix */}
                <Text style={styles.name}>{place.name}</Text>
                <View style={styles.ratingRow}>
                  {place.rating != null ? (
                    <Text style={styles.rating}>⭐ {place.rating}</Text>
                  ) : null}
                  {place.price_level != null ? (
                    <Text style={styles.price}>{PRICE_LEVEL[place.price_level] ?? ''}</Text>
                  ) : null}
                </View>

                {/* Adresse */}
                {place.formatted_address ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoIcon}>📍</Text>
                    <Text style={styles.infoText}>{place.formatted_address}</Text>
                  </View>
                ) : null}

                {/* Téléphone */}
                {place.formatted_phone_number ? (
                  <TouchableOpacity
                    style={styles.infoRow}
                    onPress={() => Linking.openURL(`tel:${place.formatted_phone_number}`)}
                  >
                    <Text style={styles.infoIcon}>📞</Text>
                    <Text style={[styles.infoText, styles.link]}>{place.formatted_phone_number}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Site web */}
                {place.website ? (
                  <TouchableOpacity
                    style={styles.infoRow}
                    onPress={() => Linking.openURL(place.website)}
                  >
                    <Text style={styles.infoIcon}>🌐</Text>
                    <Text style={[styles.infoText, styles.link]} numberOfLines={1}>{place.website}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Horaires */}
                {place.opening_hours?.weekday_text?.length ? (
                  <View style={styles.hoursContainer}>
                    <Text style={styles.hoursTitle}>🕐 Horaires</Text>
                    {place.opening_hours.weekday_text.map((line, i) => (
                      <Text key={i} style={styles.hoursLine}>{line}</Text>
                    ))}
                  </View>
                ) : null}

                {/* Boutons d'action */}
                <View style={styles.actions}>
                  {lodging ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnAccent]}
                      onPress={handleAddAccommodation}
                      disabled={!!adding}
                    >
                      {adding === 'accommodation' ? (
                        <ActivityIndicator color={COLORS.bg} size="small" />
                      ) : (
                        <Text style={styles.actionBtnTextDark}>🏨 Ajouter comme hébergement</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  {activity ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        lodging ? styles.actionBtnOutline : styles.actionBtnAccent,
                      ]}
                      onPress={handleAddActivity}
                      disabled={!!adding}
                    >
                      {adding === 'activity' ? (
                        <ActivityIndicator
                          color={lodging ? COLORS.accent : COLORS.bg}
                          size="small"
                        />
                      ) : (
                        <Text
                          style={[
                            styles.actionBtnTextDark,
                            lodging && styles.actionBtnTextOutline,
                          ]}
                        >
                          🎭 Ajouter comme activité
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnClose]} onPress={onClose}>
                    <Text style={styles.actionBtnTextClose}>✕ Fermer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  centered: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginBottom: SPACING.md,
  },
  closeBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: 220,
  },
  dots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 14,
    borderRadius: 3,
  },
  content: {
    padding: SPACING.lg,
  },
  name: {
    fontFamily: FONTS.title,
    fontSize: 22,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  rating: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  price: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  infoIcon: {
    fontSize: 15,
    lineHeight: 22,
  },
  infoText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
  hoursContainer: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
  },
  hoursTitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  hoursLine: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  actionBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionBtnAccent: {
    backgroundColor: COLORS.accent,
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'transparent',
  },
  actionBtnClose: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  actionBtnTextDark: {
    color: COLORS.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtnTextOutline: {
    color: COLORS.accent,
  },
  actionBtnTextClose: {
    color: COLORS.textMuted,
    fontSize: 15,
  },
});
