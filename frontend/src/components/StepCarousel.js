import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_WIDTH = 230;
const CONNECTOR_WIDTH = 48;
const CARD_HEIGHT = 175;
// Distance réelle entre le début d'une carte et le début de la suivante
// (les items sont directement adjacents dans le layout, pas de gap)
const SNAP_INTERVAL = CARD_WIDTH + CONNECTOR_WIDTH;
const PEEK_CENTER = (SCREEN_W - CARD_WIDTH) / 2;

const ORDER_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

function formatDayMonth(dateStr) {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return null;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`
    : `${Math.round(minutes)}min`;
}

function durationDays(start, end) {
  if (!start || !end) return 0;
  const d = Math.round((new Date(end) - new Date(start)) / 86400000);
  return d > 0 ? d : 0;
}

function formatTime(t) {
  if (!t) return null;
  if (typeof t === 'string') {
    const hhmm = t.match(/^(\d{2}:\d{2})/);
    if (hhmm?.[1]) return hhmm[1];
  }
  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return null;
}

/**
 * StepCarousel — bandeau horizontal d'étapes défilable en bas de l'écran.
 * Met à jour la carte au scroll via onScrollIndexChange.
 * Le trajet (distance/temps) est affiché entre les cartes, pas dedans.
 *
 * Props :
 *   steps               — tableau des étapes transformées
 *   selectedIndex       — index actuellement sélectionné (-1 = vue globale)
 *   onEditStep          — callback(index) au tap sur une carte (ouvre l'édition)
 *   onScrollIndexChange — callback(index) déclenché quand une carte se centre au scroll
 */
export default function StepCarousel({
  steps,
  weatherMap,
  selectedIndex,
  onEditStep,
  onScrollIndexChange,
}) {
  const scrollRef = useRef(null);
  const isMomentum = useRef(false);
  const lastReportedIndex = useRef(selectedIndex);
  const isExternalUpdate = useRef(false);

  // Positions exactes de snap pour chaque carte
  const snapOffsets = useMemo(
    () => steps.map((_, i) => i * SNAP_INTERVAL),
    [steps.length]
  );

  // Trouver l'index de la carte la plus proche d'un offset donné
  const findNearestIndex = useCallback((offsetX) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapOffsets.length; i++) {
      const dist = Math.abs(offsetX - snapOffsets[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [snapOffsets]);

  // Scroller automatiquement quand selectedIndex change
  useEffect(() => {
    if (selectedIndex >= 0 && scrollRef.current && !isMomentum.current) {
      isExternalUpdate.current = true;
      const offsetX = snapOffsets[selectedIndex] ?? 0;
      scrollRef.current.scrollTo({ x: Math.max(0, offsetX), animated: true });
    }
  }, [selectedIndex, snapOffsets]);

  // Détecter quelle carte est centrée après un scroll
  const handleMomentumEnd = useCallback((e) => {
    isMomentum.current = false;
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = findNearestIndex(offsetX);
    const clampedIndex = Math.max(0, Math.min(steps.length - 1, index));

    if (isExternalUpdate.current) {
      isExternalUpdate.current = false;
      lastReportedIndex.current = clampedIndex;
      return;
    }

    if (clampedIndex !== lastReportedIndex.current && onScrollIndexChange) {
      lastReportedIndex.current = clampedIndex;
      onScrollIndexChange(clampedIndex);
    }
  }, [steps.length, findNearestIndex, onScrollIndexChange]);

  const handleScrollEndDrag = useCallback((e) => {
    if (isExternalUpdate.current) return;
    if (!isMomentum.current) {
      const offsetX = e.nativeEvent.contentOffset.x;
      const index = findNearestIndex(offsetX);
      const clampedIndex = Math.max(0, Math.min(steps.length - 1, index));
      if (clampedIndex !== lastReportedIndex.current && onScrollIndexChange) {
        lastReportedIndex.current = clampedIndex;
        onScrollIndexChange(clampedIndex);
      }
    }
  }, [steps.length, findNearestIndex, onScrollIndexChange]);

  const handleScrollBeginDrag = useCallback(() => {
    isMomentum.current = true;
    isExternalUpdate.current = false;
  }, []);

  if (!steps?.length) return null;

  return (
    <View style={styles.wrapper}>
      {/* Fond du bandeau (séparation visuelle avec la carte) */}
      <View style={styles.bandeauBg} pointerEvents="none" />

      {/* Carrousel horizontal — cartes + connecteurs intercalés */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingLeft: PEEK_CENTER, paddingRight: PEEK_CENTER },
        ]}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        pagingEnabled={false}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleScrollEndDrag}
        onScrollBeginDrag={handleScrollBeginDrag}
        scrollEventThrottle={16}
      >
        {steps.flatMap((step, index) => {
          const color = ORDER_COLORS[index % ORDER_COLORS.length];
          const isActive = index === selectedIndex;
          const nights = durationDays(step.startDate, step.endDate);
          const isFirst = index === 0;
          const hasPhoto = !!step.photoUrl;

          // Distance/trajet VERS cette étape (donnée de l'étape courante)
          const distance = step.distanceFromPrev;
          const duration = step.durationFromPrev;
          const prevStep = index > 0 ? steps[index - 1] : null;

          const elements = [];

          // ── Connecteur (toujours présent pour le snap, vide si pas de distance) ──
          if (index > 0) {
            const connColor = ORDER_COLORS[(index - 1) % ORDER_COLORS.length];
            elements.push(
              <View key={`conn-${step.id}`} style={styles.connectorWrapper}>
                {/* Trait de liaison vertical */}
                <View style={[styles.connectorLine, { backgroundColor: connColor }]} />
                {distance > 0 && prevStep ? (
                  <>
                    {/* Pastille ronde avec 🚐 */}
                    <View style={[styles.connectorDot, { borderColor: connColor }]}>
                      <Text style={styles.connectorIcon}>🚐</Text>
                    </View>
                    {/* Infos distance */}
                    <Text style={styles.connectorDist}>
                      {distance} km
                    </Text>
                    {duration > 0 && (
                      <Text style={styles.connectorDuration}>
                        {formatDuration(duration)}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    {/* Connecteur vide : petit trait discret pour garder l'espace */}
                    <View style={styles.connectorEmptyDot} />
                  </>
                )}
              </View>
            );
          }

          // ── Carte de l'étape ──
          const cardContent = (
            <TouchableOpacity
              style={[
                hasPhoto ? styles.cardPhotoContent : styles.card,
                isActive && !hasPhoto && styles.cardActive,
              ]}
              onPress={() => {
                if (onEditStep) onEditStep(index);
              }}
              activeOpacity={0.8}
            >
              {/* Barre colorée supérieure (cachée si photo) */}
              {!hasPhoto && <View style={[styles.cardAccent, { backgroundColor: color }]} />}

              {/* Header compact : badge + nom + edit (tout en haut) */}
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: color }]}>
                  <Text style={styles.badgeText}>{index + 1}</Text>
                </View>
                <Text
                  style={[styles.stepName, isActive && styles.stepNameActive]}
                  numberOfLines={1}
                >
                  {step.name || `Étape ${index + 1}`}
                </Text>
                {/* Météo */}
                {weatherMap?.[step.id] && (
                  <View style={styles.weatherBadge}>
                    <Text style={styles.weatherIcon}>{weatherMap[step.id].icon}</Text>
                    <Text style={styles.weatherTemp}>
                      {weatherMap[step.id].tempMorning != null
                        ? `${Math.round(weatherMap[step.id].tempMorning)}°`
                        : weatherMap[step.id].tempMax != null
                        ? `${Math.round(weatherMap[step.id].tempMax)}°`
                        : ''}
                      {weatherMap[step.id].tempAfternoon != null
                        ? `/${Math.round(weatherMap[step.id].tempAfternoon)}°`
                        : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Espace vide au milieu = la photo respire */}
              <View style={{ flex: 1 }} />

              {/* Barre inférieure : date + heures sur une ligne */}
              <View style={styles.bottomBar}>
                {step.startDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={styles.bottomDate} numberOfLines={1}>
                      📅 {formatDayMonth(step.startDate)}
                      {step.arrivalTime ? ` ${formatTime(step.arrivalTime)}` : ''}
                      {step.endDate ? ` → ${formatDayMonth(step.endDate)}` : ''}
                      {step.departureTime && !step.endDate ? ` → ${formatTime(step.departureTime)}` : ''}
                      {step.endDate && step.departureTime ? ` ${formatTime(step.departureTime)}` : ''}
                    </Text>

                    {nights > 0 ? (
                      <Text style={styles.bottomNights}>🌙 {nights}n</Text>
                    ) : isFirst ? (
                      <Text style={styles.bottomStart}>🏁 Départ</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={styles.bottomDate}>📅 Date libre</Text>
                  </View>
                )}
              </View>

              {/* Glow actif (positionné dans la carte) */}
              {isActive && <View style={styles.activeGlow} />}
            </TouchableOpacity>
          );

          if (hasPhoto) {
            elements.push(
              <View key={step.id} style={styles.cardPhotoContainer}>
                {/* Image en fond (absolue) */}
                <Image
                  source={{ uri: step.photoUrl }}
                  style={styles.cardPhotoImg}
                  resizeMode="cover"
                />
                {/* Voile sombre pour lisibilité */}
                <View style={styles.photoOverlay} />
                {/* Contenu overlay */}
                {cardContent}
              </View>
            );
          } else {
            elements.push(
              <View key={step.id} style={styles.cardWrapper}>
                {cardContent}
              </View>
            );
          }

          return elements;
        })}
      </ScrollView>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 12,
  elevation: 10,
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 20,
    paddingLeft: 0,
    pointerEvents: 'box-none',
  },

  // ─── Fond du bandeau ────────────────────────────────────────────────
  bandeauBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT + 50,
    backgroundColor: 'rgba(14,14,22,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    // Ombre portée haute pour séparer de la carte
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 25,
  },

  // ─── ScrollContent ──────────────────────────────────────────────────
  scrollContent: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
  },

  // ─── Carte d'étape ──────────────────────────────────────────────────
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: 'rgba(22,22,34,0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    ...SHADOW,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  cardActive: {
    backgroundColor: 'rgba(28,28,44,0.96)',
    borderColor: 'rgba(255,255,255,0.15)',
    shadowOpacity: 0.5,
    elevation: 14,
  },

  // ─── Carte avec photo ───────────────────────────────────────────────
  cardPhotoContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOW,
    position: 'relative',
  },
  cardPhotoImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  cardPhotoContent: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: 'space-between',
    position: 'relative',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },

  cardAccent: {
    height: 3,
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  stepName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  stepNameActive: {
    color: '#f59e0b',
  },

  // ─── Météo ──────────────────────────────────────────────────────────────────
  weatherBadge: {
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  weatherIcon: {
    fontSize: 16,
  },
  weatherTemp: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    marginTop: -1,
  },

  // ─── Barre inférieure (dates + heures sur une ligne) ──────────────
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    flexShrink: 1,
  },
  bottomNights: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '700',
    marginLeft: 8,
  },
  bottomStart: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    marginLeft: 8,
  },
  activeGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.3)',
    pointerEvents: 'none',
  },
  cardWrapper: {},


  // ─── Connecteur de trajet entre les cartes ──────────────────────────
  connectorWrapper: {
    width: CONNECTOR_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    position: 'relative',
    zIndex: 2,
  },
  connectorLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    opacity: 0.25,
  },
  connectorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(22,22,34,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 2,
  },
  connectorIcon: {
    fontSize: 13,
  },
  connectorDist: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ade80',
  },
  connectorDuration: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  connectorEmptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 2,
  },
});
