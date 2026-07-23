import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useQuery } from '@powersync/react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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

function formatMoney(amount, currency) {
  if (amount == null) return '';
  const sym = { EUR: '€', USD: '$', GBP: '£', CAD: '$' };
  return `${amount.toFixed(2)} ${sym[currency] || currency}`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h${m > 0 ? m : ''}`;
}

function formatDistance(meters) {
  if (!meters) return '';
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

function toLocalDateString(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const ACCOM_ICONS = { HOTEL: '🏨', CAMPING: '🏕️', PARKING: '🅿️', OTHER: '🏠' };
const ACTIVITY_ICONS = {
  ACTIVITY: '🎯', RESTAURANT: '🍽️', TRANSPORT: '🚗', HIKING: '🥾',
  SUPERMARKET: '🛒', OTHER: '📍',
};
const BOOKING_STATUS = { PLANNED: '📋', BOOKED: '✅', DONE: '✔️', CANCELLED: '❌' };
const MEMBER_ROLES = { OWNER: '👑', EDITOR: '✏️', VIEWER: '👁️' };

const ORDER_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

// ─── Écran ───────────────────────────────────────────────────────────────────
export default function RoadbookPreviewScreen({ route, navigation }) {
  const { roadtripId, roadtripTitle } = route.params;

  // PowerSync queries
  const { data: roadtrip } = useQuery('SELECT * FROM roadtrips WHERE id = ?', [roadtripId]);
  const { data: steps = [] } = useQuery(
    'SELECT * FROM steps WHERE roadtripId = ? ORDER BY "order" ASC', [roadtripId]
  );
  const { data: accommodations = [] } = useQuery(
    'SELECT * FROM accommodations WHERE roadtripId = ?', [roadtripId]
  );
  const { data: activities = [] } = useQuery(
    'SELECT * FROM activities WHERE roadtripId = ?', [roadtripId]
  );
  const { data: photos = [] } = useQuery(
    'SELECT * FROM photos WHERE roadtripId = ? ORDER BY createdAt ASC', [roadtripId]
  );

  const rt = roadtrip?.[0];

  // Stats
  const totalKm = useMemo(() =>
    steps.reduce((sum, s) => sum + (s.routeDistanceMeters || 0), 0), [steps]
  );
  const totalDuration = useMemo(() =>
    steps.reduce((sum, s) => sum + (s.routeDurationSeconds || 0), 0), [steps]
  );
  const totalAccomPrice = useMemo(() =>
    accommodations.reduce((sum, a) => sum + (a.totalPrice || 0), 0), [accommodations]
  );
  const totalActivityCost = useMemo(() =>
    activities.reduce((sum, a) => sum + (a.cost || 0), 0), [activities]
  );
  const totalDeposits = useMemo(() => {
    const accom = accommodations.reduce((sum, a) => sum + (a.depositPaid || 0), 0);
    const act = activities.reduce((sum, a) => sum + (a.depositPaid || 0), 0);
    return accom + act;
  }, [accommodations, activities]);
  const totalBalance = totalAccomPrice + totalActivityCost - totalDeposits;

  // ─── Météo ──────────────────────────────────────────────────────────────────
  const [weatherMap, setWeatherMap] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);

  const fetchWeather = useCallback(async () => {
    const stepsWithCoords = steps.filter(s => s.latitude && s.longitude && s.startDate);
    if (stepsWithCoords.length === 0) return;

    setWeatherLoading(true);
    try {
      const body = {
        steps: stepsWithCoords.map(s => ({
          id: s.id,
          lat: s.latitude,
          lng: s.longitude,
          date: s.startDate.slice(0, 10),
        })),
      };
      console.log('[Weather] Fetching for', body.steps.length, 'steps');
      const res = await client.post('/api/weather/batch', body);
      console.log('[Weather] Response:', res.data?.weather ? Object.keys(res.data.weather).length + ' results' : 'no data');
      if (res.data?.weather) {
        setWeatherMap(res.data.weather);
      }
    } catch (err) {
      console.error('[Weather] Erreur:', err.message);
    } finally {
      setWeatherLoading(false);
    }
  }, [steps]);

  useEffect(() => {
    if (steps.length > 0) fetchWeather();
  }, [steps, fetchWeather]);

  useEffect(() => {
    navigation.setOptions({
      title: roadtripTitle ? `Roadbook — ${roadtripTitle}` : 'Roadbook',
    });
  }, [navigation, roadtripTitle]);

  if (!rt) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  const coverPhoto = photos.find(p => p.isCover) || photos[0];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ═══ COVER ═══ */}
        <View style={[styles.cover, coverPhoto?.url && styles.coverWithPhoto]}>
          {coverPhoto?.url && (
            <Image source={{ uri: coverPhoto.url }} style={styles.coverPhoto} />
          )}
          <View style={coverPhoto?.url ? styles.coverOverlay : null}>
            <View style={styles.coverBadge}>
              <Text style={styles.coverBadgeText}>★ Roadbook ★</Text>
            </View>
            <Text style={styles.coverTitle}>{rt.title}</Text>
            <View style={styles.coverDivider} />
            {rt.startDate && (
              <Text style={styles.coverDates}>
                {formatDate(rt.startDate)}
                {rt.endDate ? ` → ${formatDate(rt.endDate)}` : ''}
              </Text>
            )}
            <Text style={styles.coverFooter}>Mon Petit Roadtrip</Text>
          </View>
        </View>

        {/* ═══ OVERVIEW ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
          <Text style={styles.sectionSubtitle}>
            {steps.length} étapes · {formatDistance(totalKm)} · {formatDuration(totalDuration)}
          </Text>

          <View style={styles.statsGrid}>
            <StatCard icon="📍" value={steps.length} label="Étapes" />
            <StatCard icon="🛣️" value={formatDistance(totalKm)} label="Distance" />
            <StatCard icon="⏱️" value={formatDuration(totalDuration)} label="Route" />
            <StatCard icon="🏠" value={accommodations.length} label="Hébergements" />
          </View>

          {/* Itinéraire */}
          <Text style={styles.subSectionTitle}>🗺️ Itinéraire</Text>
          {steps.map((s, i) => {
            const prevStep = i > 0 ? steps[i - 1] : null;
            const routeStr = prevStep?.routeDistanceMeters
              ? `${formatDistance(prevStep.routeDistanceMeters)} · ${formatDuration(prevStep.routeDurationSeconds)}`
              : '';
            return (
              <View key={s.id} style={styles.itineraireItem}>
                <View style={[styles.itineraireDay, { backgroundColor: ORDER_COLORS[i % ORDER_COLORS.length] }]}>
                  <Text style={styles.itineraireDayText}>{i + 1}</Text>
                </View>
                <View style={styles.itineraireInfo}>
                  <Text style={styles.itineraireName}>{s.name}</Text>
                  <Text style={styles.itineraireMeta}>
                    {s.location || ''}{routeStr ? ` · ${routeStr}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ═══ STEP PAGES ═══ */}
        {steps.map((step, idx) => {
          const stepAccoms = accommodations.filter(a => a.stepId === step.id);
          const stepActs = activities.filter(a => a.stepId === step.id);
          const stepPhotos = photos.filter(p => p.stepId === step.id);
          const prevStep = idx > 0 ? steps[idx - 1] : null;
          const hasRoute = prevStep?.routeDistanceMeters;
          const color = ORDER_COLORS[idx % ORDER_COLORS.length];

          return (
            <View key={step.id} style={styles.stepCard}>
              {/* Header */}
              <View style={[styles.stepHeader, { backgroundColor: color }]}>
                <View style={styles.stepHeaderRow}>
                  <View style={styles.stepHeaderInfo}>
                    <Text style={styles.stepDay}>Jour {idx + 1}</Text>
                    <Text style={styles.stepTitle}>{step.name}</Text>
                    {step.location && <Text style={styles.stepLocation}>{step.location}</Text>}
                  </View>
                  {/* Météo */}
                  {weatherMap[step.id] ? (
                    <View style={styles.weatherBadge}>
                      <Text style={styles.weatherIcon}>{weatherMap[step.id].icon || '🌡️'}</Text>
                      <Text style={styles.weatherTemp}>
                        {weatherMap[step.id].tempMax != null
                          ? `${Math.round(weatherMap[step.id].tempMax)}°`
                          : ''}
                        {weatherMap[step.id].tempMin != null
                          ? `/ ${Math.round(weatherMap[step.id].tempMin)}°`
                          : ''}
                      </Text>
                    </View>
                  ) : weatherLoading ? (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                  ) : step.latitude && step.startDate ? (
                    <View style={styles.weatherBadgeEmpty}>
                      <Text style={styles.weatherIcon}>🌡️</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.stepDates}>
                  {step.startDate ? formatShortDate(step.startDate) : ''}
                  {step.endDate ? ` → ${formatShortDate(step.endDate)}` : ''}
                </Text>
                {(step.arrivalTime || step.departureTime) && (
                  <Text style={styles.stepTimes}>
                    🕒 {formatTime(step.arrivalTime) ?? '--:--'}
                    {step.arrivalTime && step.departureTime ? ' → ' : ''}
                    {formatTime(step.departureTime) ?? ''}
                  </Text>
                )}
              </View>

              {/* Photos */}
              {stepPhotos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                  {stepPhotos.slice(0, 5).map(p => (
                    <Image key={p.id} source={{ uri: p.url }} style={styles.thumbPhoto} />
                  ))}
                </ScrollView>
              )}

              {/* Route info */}
              {hasRoute && (
                <View style={styles.routeBar}>
                  <Text style={styles.routeStat}>🛣️ {formatDistance(prevStep.routeDistanceMeters)}</Text>
                  <Text style={styles.routeStat}>⏱️ {formatDuration(prevStep.routeDurationSeconds)}</Text>
                </View>
              )}

              {/* Détails */}
              <View style={styles.stepDetails}>
                {stepAccoms.length > 0 && (
                  <>
                    <Text style={styles.stepSectionTitle}>
                      🏠 Hébergement{stepAccoms.length > 1 ? 's' : ''}
                    </Text>
                    {stepAccoms.map(a => (
                      <View key={a.id} style={styles.accomCard}>
                        <View style={styles.accomHeader}>
                          <Text style={styles.accomType}>
                            {ACCOM_ICONS[a.type] || '🏠'} {a.type}
                          </Text>
                          {a.status && (
                            <Text style={styles.accomStatus}>{BOOKING_STATUS[a.status] || ''}</Text>
                          )}
                        </View>
                        <Text style={styles.accomName}>{a.name}</Text>
                        {a.address && <Text style={styles.accomAddress}>📍 {a.address}</Text>}

                        {(a.checkIn || a.checkOut) && (
                          <View style={styles.accomDates}>
                            {a.checkIn && (
                              <Text style={styles.accomDateRow}>
                                🛏️ Arrivée : {formatDate(a.checkIn)}{formatTime(a.checkIn) ? ` ${formatTime(a.checkIn)}` : ''}
                              </Text>
                            )}
                            {a.checkOut && (
                              <Text style={styles.accomDateRow}>
                                🚪 Départ : {formatDate(a.checkOut)}{formatTime(a.checkOut) ? ` ${formatTime(a.checkOut)}` : ''}
                              </Text>
                            )}
                          </View>
                        )}

                        <View style={styles.accomMetaRow}>
                          {a.bookingRef && <Text style={styles.accomMeta}>🔖 Réf: {a.bookingRef}</Text>}
                          {a.totalPrice && (
                            <Text style={styles.accomPrice}>💰 {formatMoney(a.totalPrice, a.currency)}</Text>
                          )}
                          {a.depositPaid && (
                            <Text style={styles.accomDeposit}>
                              💳 Arrhes: {formatMoney(a.depositPaid, a.currency)}
                            </Text>
                          )}
                        </View>

                        {a.bookingUrl && (
                          <Text style={styles.accomLink}>🔗 {a.bookingUrl}</Text>
                        )}
                        {a.notes && <Text style={styles.accomNotes}>{a.notes}</Text>}
                      </View>
                    ))}
                  </>
                )}

                {stepActs.length > 0 && (
                  <>
                    <Text style={styles.stepSectionTitle}>🎯 Activités</Text>
                    {stepActs.map(a => (
                      <View key={a.id} style={styles.activityItem}>
                        <View style={styles.activityHeader}>
                          <Text style={styles.activityName}>
                            {ACTIVITY_ICONS[a.type] || '📍'} {a.name}
                          </Text>
                          {a.status && (
                            <Text style={styles.activityStatus}>{BOOKING_STATUS[a.status] || ''}</Text>
                          )}
                        </View>

                        {(a.startTime || a.endTime) && (
                          <Text style={styles.activityTime}>
                            🕐 {formatTime(a.startTime) || ''}{a.startTime && a.endTime ? ' → ' : ''}{formatTime(a.endTime) || ''}
                          </Text>
                        )}

                        {a.location && <Text style={styles.activityMeta}>📍 {a.location}</Text>}
                        {a.notes && <Text style={styles.activityMeta}>{a.notes}</Text>}

                        <View style={styles.activityMetaRow}>
                          {a.bookingRef && <Text style={styles.accomMeta}>🔖 {a.bookingRef}</Text>}
                          {a.cost && (
                            <Text style={styles.activityCost}>💰 {formatMoney(a.cost, a.currency)}</Text>
                          )}
                          {a.depositPaid && (
                            <Text style={styles.accomDeposit}>
                              💳 Arrhes: {formatMoney(a.depositPaid, a.currency)}
                            </Text>
                          )}
                        </View>

                        {a.bookingUrl && (
                          <Text style={styles.accomLink}>🔗 {a.bookingUrl}</Text>
                        )}
                      </View>
                    ))}
                  </>
                )}

                {step.notes && (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>📝 Notes</Text>
                    <Text style={styles.notesText}>{step.notes}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* ═══ BUDGET SUMMARY ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Budget</Text>
          <Text style={styles.sectionSubtitle}>Récapitulatif des dépenses</Text>
          <View style={styles.budgetTable}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>🏠 Hébergements</Text>
              <Text style={styles.budgetValue}>{formatMoney(totalAccomPrice, 'EUR')}</Text>
            </View>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>🎯 Activités</Text>
              <Text style={styles.budgetValue}>{formatMoney(totalActivityCost, 'EUR')}</Text>
            </View>
            <View style={[styles.budgetRow, styles.budgetSubRow]}>
              <Text style={styles.budgetSubLabel}>💳 Acomptes versés</Text>
              <Text style={styles.budgetSubValue}>
                {formatMoney(totalDeposits, 'EUR')}
              </Text>
            </View>
            <View style={[styles.budgetRow, styles.budgetSubRow]}>
              <Text style={styles.budgetSubLabel}>📅 Reste à payer</Text>
              <Text style={[styles.budgetSubValue, { color: totalBalance > 0 ? '#d4574a' : '#22c55e' }]}>
                {formatMoney(Math.max(totalBalance, 0), 'EUR')}
              </Text>
            </View>
            <View style={[styles.budgetRow, styles.budgetTotalRow]}>
              <Text style={styles.budgetTotalLabel}>💰 Budget total</Text>
              <Text style={styles.budgetTotalValue}>
                {formatMoney(totalAccomPrice + totalActivityCost, 'EUR')}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const CARD_MARGIN = 16;
const PHOTO_H = 100;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fef6e9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // ── Cover ──
  cover: { backgroundColor: '#d4574a', padding: 40, alignItems: 'center', position: 'relative' },
  coverWithPhoto: { padding: 0 },
  coverPhoto: { width: '100%', height: 260, resizeMode: 'cover' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  coverBadge: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 16, paddingVertical: 4, marginBottom: 16 },
  coverBadgeText: { color: '#fff', fontSize: 12, letterSpacing: 3, fontWeight: '600' },
  coverTitle: { fontSize: 36, fontWeight: '900', color: '#fff', textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 },
  coverDivider: { width: 60, height: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginVertical: 12, borderRadius: 2 },
  coverDates: { fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  coverFooter: { marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 },

  // ── Sections ──
  section: { backgroundColor: '#fef6e9', padding: 20 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#d4574a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  sectionSubtitle: { fontSize: 13, color: '#8a7a6a', marginBottom: 16, fontWeight: '600' },
  subSectionTitle: { fontSize: 16, fontWeight: '900', color: '#d4574a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 8 },

  // ── Stats ──
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e6a817', padding: 10, alignItems: 'center' },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900', color: '#d4574a' },
  statLabel: { fontSize: 9, color: '#8a7a6a', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },

  // ── Itinéraire ──
  itineraireItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e6a817', borderStyle: 'dashed' },
  itineraireDay: { width: 28, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  itineraireDayText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  itineraireInfo: { flex: 1 },
  itineraireName: { fontSize: 14, fontWeight: '700', color: '#3d2e1e' },
  itineraireMeta: { fontSize: 11, color: '#8a7a6a', marginTop: 1 },

  // ── Step card ──
  stepCard: { marginHorizontal: CARD_MARGIN, marginBottom: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e6a817', overflow: 'hidden' },
  stepHeader: { padding: 16 },
  stepHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stepHeaderInfo: { flex: 1, marginRight: 12 },
  stepDay: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  stepTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  stepLocation: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  stepDates: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  stepTimes: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  // ── Weather ──
  weatherBadge: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, minWidth: 55 },
  weatherBadgeEmpty: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, minWidth: 40 },
  weatherIcon: { fontSize: 24 },
  weatherTemp: { fontSize: 11, fontWeight: '700', color: '#fff', marginTop: 1 },

  // ── Photos ──
  photoStrip: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fef6e9' },
  thumbPhoto: { width: PHOTO_H * 1.5, height: PHOTO_H, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#e6a817' },

  // ── Route bar ──
  routeBar: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#e6a817' },
  routeStat: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── Step details ──
  stepDetails: { padding: 16 },
  stepSectionTitle: { fontSize: 14, fontWeight: '900', color: '#d4574a', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: '#e6a817', borderStyle: 'double' },

  // ── Accommodation ──
  accomCard: { backgroundColor: '#fef6e9', borderWidth: 1, borderColor: '#e6a817', padding: 12, marginBottom: 8 },
  accomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  accomType: { fontSize: 11, fontWeight: '700', color: '#d4574a', textTransform: 'uppercase', letterSpacing: 1 },
  accomStatus: { fontSize: 16 },
  accomName: { fontSize: 15, fontWeight: '700', color: '#3d2e1e' },
  accomAddress: { fontSize: 12, color: '#8a7a6a', marginTop: 2 },
  accomDates: { marginTop: 6, padding: 6, backgroundColor: '#fff', borderRadius: 4 },
  accomDateRow: { fontSize: 12, color: '#6a5a4a', marginVertical: 1 },
  accomMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  accomMeta: { fontSize: 11, color: '#8a7a6a' },
  accomPrice: { fontSize: 12, color: '#d4574a', fontWeight: '600' },
  accomDeposit: { fontSize: 11, color: '#8a7a6a' },
  accomLink: { fontSize: 11, color: '#3b82f6', marginTop: 4, textDecorationLine: 'underline' },
  accomNotes: { fontSize: 12, color: '#8a7a6a', fontStyle: 'italic', marginTop: 6, padding: 8, backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#e6a817' },

  // ── Activities ──
  activityItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e6a817', borderStyle: 'dashed' },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityName: { fontSize: 14, fontWeight: '700', color: '#3d2e1e', flex: 1 },
  activityStatus: { fontSize: 14, marginLeft: 8 },
  activityTime: { fontSize: 12, color: '#8a7a6a', marginTop: 2 },
  activityMeta: { fontSize: 12, color: '#8a7a6a', marginTop: 2 },
  activityMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  activityCost: { fontSize: 12, color: '#d4574a', fontWeight: '600' },

  // ── Notes ──
  notesBox: { marginTop: 12, padding: 12, backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#e6a817' },
  notesLabel: { fontSize: 12, fontWeight: '700', color: '#d4574a', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  notesText: { fontSize: 13, color: '#3d2e1e', fontStyle: 'italic', lineHeight: 20 },

  // ── Budget ──
  budgetTable: { borderWidth: 2, borderColor: '#e6a817', marginTop: 8 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e6a817', borderStyle: 'dashed', backgroundColor: '#fff' },
  budgetLabel: { fontSize: 14, color: '#3d2e1e' },
  budgetValue: { fontSize: 14, fontWeight: '600', color: '#3d2e1e' },
  budgetSubRow: { backgroundColor: '#fff8f0' },
  budgetSubLabel: { fontSize: 13, color: '#8a7a6a' },
  budgetSubValue: { fontSize: 13, fontWeight: '600', color: '#8a7a6a' },
  budgetTotalRow: { backgroundColor: '#fef6e9', borderBottomWidth: 0 },
  budgetTotalLabel: { fontSize: 15, fontWeight: '900', color: '#d4574a' },
  budgetTotalValue: { fontSize: 15, fontWeight: '900', color: '#d4574a' },
});
