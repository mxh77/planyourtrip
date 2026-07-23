import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
  Linking,
  Modal,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_WIDTH = 255;
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

// ── Statut du trajet entre deux étapes ─────────────────────────────────────
// Retourne { color, label, status } pour le code couleur du connecteur
function getTravelStatus(prevStep, nextStep) {
  const duration = nextStep?.durationFromPrev || prevStep?.durationFromPrev;
  if (!duration || duration <= 0) return { color: '#4ade80', label: '', status: 'unknown' };

  const minutes = duration;
  const hours = minutes / 60;

  // Heure de départ (departureTime ou 10h par défaut) — inclut les minutes
  const depMatch = prevStep?.departureTime?.match(/^(\d{1,2}):(\d{2})/);
  const depHour = depMatch ? parseInt(depMatch[1]) + parseInt(depMatch[2]) / 60 : 10;
  // Heure d'arrivée souhaitée (arrivalTime ou 20h par défaut) — inclut les minutes
  const arrMatch = nextStep?.arrivalTime?.match(/^(\d{1,2}):(\d{2})/);
  const arrHour = arrMatch ? parseInt(arrMatch[1]) + parseInt(arrMatch[2]) / 60 : 20;

  const availableMinutes = (arrHour - depHour) * 60;

  // 🟢 OK : route confortable
  if (minutes <= availableMinutes && minutes <= 240) {
    return { color: '#4ade80', label: '✓', status: 'good' };
  }
  // 🟡 Long : route > 4h mais faisable
  if (minutes <= availableMinutes && minutes <= 360) {
    return { color: '#facc15', label: '⚠', status: 'moderate' };
  }
  // 🟠 Très long : route > 6h
  if (minutes > 360 && minutes <= availableMinutes) {
    return { color: '#fb923c', label: '⚠', status: 'long' };
  }
  // 🔴 Trop long : dépasse le temps disponible
  return { color: '#ef4444', label: '✗', status: 'tight' };
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
  onConnectorPress,
}) {
  const scrollRef = useRef(null);
  const isMomentum = useRef(false);
  const lastReportedIndex = useRef(selectedIndex);
  const isExternalUpdate = useRef(false);
  const [travelModal, setTravelModal] = useState(null); // { prevStep, nextStep, distance, duration, travelStatus, mapsUrl }

  // Fermer la modal
  const closeTravelModal = useCallback(() => setTravelModal(null), []);

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
            const travelStatus = getTravelStatus(steps[index - 1], step);
            elements.push(
              <TouchableOpacity
                key={`conn-${step.id}`}
                style={styles.connectorWrapper}
                activeOpacity={0.6}
                onPress={() => {
                  if (!onConnectorPress) return;
                  const prev = steps[index - 1];
                  const nxt = step;
                  const prevLat = prev?.latitude || prev?.departureLatitude;
                  const prevLng = prev?.longitude || prev?.departureLongitude;
                  const origin = prevLat && prevLng ? `${prevLat},${prevLng}` : (prev?.location || '');
                  const dest = nxt?.latitude && nxt?.longitude
                    ? `${nxt.latitude},${nxt.longitude}`
                    : (nxt?.location || '');
                  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;

                  if (travelStatus.status === 'tight' || travelStatus.status === 'long' || travelStatus.status === 'moderate') {
                    setTravelModal({ prevStep: prev, nextStep: nxt, distance, duration, travelStatus, mapsUrl });
                  } else {
                    Linking.openURL(mapsUrl);
                  }
                }}
              >
                {/* Trait de liaison vertical */}
                <View style={[styles.connectorLine, { backgroundColor: connColor }]} />
                {distance > 0 && prevStep ? (
                  <>
                    {/* Pastille ronde 🚐 avec code couleur */}
                    <View style={[styles.connectorDot, { borderColor: travelStatus.color }]}>
                      <Text style={styles.connectorIcon}>🚐</Text>
                    </View>
                    {/* Infos distance */}
                    <Text style={[styles.connectorDist, { color: travelStatus.color }]}>
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
              </TouchableOpacity>
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

      {/* ─── MODAL TRAJET ─────────────────────────────────────────────── */}
      <Modal visible={!!travelModal} transparent animationType="fade" onRequestClose={closeTravelModal}>
        {travelModal && <TravelOptionsModal data={travelModal} onClose={closeTravelModal} onNavigate={onConnectorPress} />}
      </Modal>
    </View>
  );
}

// ─── Modal d'options pour un trajet ─────────────────────────────────────────
function TravelOptionsModal({ data, onClose, onNavigate }) {
  const { prevStep, nextStep, distance, duration, travelStatus, mapsUrl } = data;

  const depStr = prevStep?.departureTime || '10:00';
  const routeStr = duration >= 60
    ? `${Math.floor(duration / 60)}h${String(Math.round(duration % 60)).padStart(2, '0')}`
    : `${Math.round(duration)}min`;

  // Calculer les créneaux d'arrivée (triés du plus tôt au plus tard)
  const depMatch = prevStep?.departureTime?.match(/^(\d{1,2}):(\d{2})/);
  const depHour = depMatch ? parseInt(depMatch[1]) + parseInt(depMatch[2]) / 60 : 10;
  const minArrivalMins = Math.round(depHour * 60 + duration);
  const roundTo30 = (mins) => Math.ceil(mins / 30) * 30;
  const slots = [
    roundTo30(minArrivalMins),
    roundTo30(minArrivalMins) + 30,
    roundTo30(minArrivalMins) + 60,
  ];

  const fmtTime = (mins) => {
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
      <View style={styles.modalSheet}>
        {/* Titre */}
        <View style={styles.modalHandleRow}>
          <View style={styles.modalHandle} />
        </View>
        <Text style={styles.modalTitle}>
          {travelStatus.status === 'tight' ? '⏱️ Trajet trop serré' : '🚗 Long trajet'}
        </Text>
        <Text style={styles.modalSubtitle}>
          {prevStep?.name || 'Départ'} → {nextStep?.name || 'Arrivée'}
        </Text>
        <View style={styles.modalRouteRow}>
          <Text style={styles.modalRouteText}>🕐 {depStr} · {routeStr}</Text>
        </View>

        {/* Créneaux d'arrivée */}
        <Text style={styles.modalSectionLabel}>AJUSTER L'ARRIVÉE</Text>
        {slots.map((mins, idx) => {
          const time = fmtTime(mins);
          const isMin = idx === 0;
          return (
            <TouchableOpacity
              key={time}
              style={styles.modalSlotBtn}
              onPress={() => {
                onNavigate?.({ nextStep, arrivalTime: time });
                onClose();
              }}
            >
              <View style={[styles.modalSlotDot, isMin && styles.modalSlotDotMin]} />
              <Text style={styles.modalSlotText}>
                {isMin ? '⭐' : '✅'} Arrivée à <Text style={styles.modalSlotTime}>{time}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Google Maps */}
        <Text style={[styles.modalSectionLabel, { marginTop: 12 }]}>NAVIGATION</Text>
        <TouchableOpacity
          style={styles.modalSlotBtn}
          onPress={() => { Linking.openURL(mapsUrl); onClose(); }}
        >
          <Text style={styles.modalSlotText}>📍 Google Maps</Text>
        </TouchableOpacity>

        {/* Annuler */}
        <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
          <Text style={styles.modalCancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
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

  // ─── Modal trajet ────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  modalHandleRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F2EFE8',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: 'rgba(242,239,232,0.6)',
    marginBottom: 8,
  },
  modalRouteRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  modalRouteText: {
    fontSize: 13,
    color: 'rgba(242,239,232,0.7)',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(242,239,232,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  modalSlotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(242,239,232,0.15)',
    marginRight: 10,
  },
  modalSlotDotMin: {
    backgroundColor: '#E8A435',
  },
  modalSlotText: {
    fontSize: 15,
    color: '#F2EFE8',
  },
  modalSlotTime: {
    fontWeight: '700',
    color: '#E8A435',
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  modalCancelText: {
    fontSize: 15,
    color: 'rgba(242,239,232,0.5)',
    fontWeight: '600',
  },
});
