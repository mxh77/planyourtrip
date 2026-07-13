import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';

const ACCOMMODATION_ICONS = {
  HOTEL: '🏨', CAMPING: '🏕️', PARKING: '🅿️', OTHER: '🏪',
};
const ACTIVITY_ICONS = {
  ACTIVITY: '🎯', RESTAURANT: '🍽️', TRANSPORT: '🚗',
  SUPERMARKET: '🛒', HIKING: '🥾', PARKING: '🅿️', OTHER: '📍',
};
const STEP_TYPE_ICONS = {
  DEPARTURE: '🚀', STAGE: '📍', STOP: '⏸️', RETURN: '🏠',
};

function formatDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function formatPrice(amount, currency = 'EUR') {
  if (amount == null || amount === '') return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) return null;
  try {
    return n.toLocaleString('fr-FR', {
      style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0,
    });
  } catch {
    return `${n} ${currency}`;
  }
}

function nbNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const diff = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return diff > 0 ? diff : null;
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

function StepRow({ step, idx, canEdit, onEditStep }) {
  const accommodations = step.accommodations ?? [];
  const allActivities = step.activities ?? [];
  const activities = allActivities.filter(
    a => a.type !== 'SUPERMARKET' && a.type !== 'PARKING' && a.type !== 'HIKING',
  );
  const hiking = allActivities.filter(a => a.type === 'HIKING');
  const supermarkets = allActivities.filter(a => a.type === 'SUPERMARKET');

  const hasDiffDates = step.endDate && step.endDate !== step.startDate;

  // Budget hébergement
  let accomTotal = null;
  let accomCurrency = 'EUR';
  accommodations.forEach(a => {
    const nights = nbNights(a.checkIn, a.checkOut);
    const price = parseFloat(a.pricePerNight);
    if (nights && !isNaN(price) && price > 0) {
      accomTotal = (accomTotal ?? 0) + nights * price;
      accomCurrency = a.currency || 'EUR';
    }
  });

  // Budget activités
  let activityTotal = null;
  allActivities.forEach(act => {
    const p = parseFloat(act.cost);
    if (!isNaN(p) && p > 0) activityTotal = (activityTotal ?? 0) + p;
  });

  return (
    <TouchableOpacity
      style={styles.stepCard}
      onPress={() => onEditStep?.(step)}
      activeOpacity={canEdit ? 0.7 : 0.95}
    >
      {/* ─── En-tête étape ─── */}
      <View style={styles.stepHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{idx + 1}</Text>
        </View>
        <View style={styles.stepTitleBlock}>
          <View style={styles.stepTitleRow}>
            <Text style={styles.stepTypeIcon}>{STEP_TYPE_ICONS[step.type] || '📍'}</Text>
            <Text style={styles.stepName} numberOfLines={2}>{step.name}</Text>
          </View>
          {step.location ? (
            <Text style={styles.stepLocation} numberOfLines={1}>{step.location}</Text>
          ) : null}
        </View>
        {canEdit && (
          <MaterialIcons name="chevron-right" size={18} color={COLORS.textDim} style={{ marginTop: 2 }} />
        )}
      </View>

      {/* ─── Dates & heures ─── */}
      {(step.startDate || step.arrivalTime || step.departureTime) ? (
        <View style={styles.datesRow}>
          <View style={styles.dateBlock}>
            {step.startDate ? (
              <Text style={styles.dateText}>{formatDate(step.startDate)}</Text>
            ) : null}
            {step.arrivalTime ? (
              <Text style={styles.timeArrival}>↓ {step.arrivalTime}</Text>
            ) : null}
          </View>
          {hasDiffDates ? (
            <>
              <Text style={styles.dateSep}>→</Text>
              <View style={styles.dateBlock}>
                <Text style={styles.dateText}>{formatDate(step.endDate)}</Text>
                {step.departureTime ? (
                  <Text style={styles.timeDeparture}>↑ {step.departureTime}</Text>
                ) : null}
              </View>
            </>
          ) : null}
          {!hasDiffDates && step.departureTime ? (
            <Text style={[styles.timeDeparture, { marginLeft: SPACING.sm }]}>
              ↑ {step.departureTime}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ─── Hébergements ─── */}
      {accommodations.length > 0 ? (
        <View style={styles.section}>
          {accommodations.map(a => {
            const nights = nbNights(a.checkIn, a.checkOut);
            const totalAccom = (nights && parseFloat(a.pricePerNight) > 0)
              ? nights * parseFloat(a.pricePerNight) : null;
            return (
              <View key={a.id} style={styles.itemRow}>
                <Text style={styles.itemIcon}>{ACCOMMODATION_ICONS[a.type] || '🏨'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{a.name}</Text>
                  {(nights || totalAccom || a.bookingRef) ? (
                    <Text style={styles.itemSub}>
                      {nights ? `${nights} nuit${nights > 1 ? 's' : ''}` : ''}
                      {nights && totalAccom ? '  ·  ' : ''}
                      {totalAccom ? formatPrice(totalAccom, a.currency || 'EUR') : ''}
                      {a.bookingRef ? `  ·  Réf: ${a.bookingRef}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ─── Activités ─── */}
      {activities.length > 0 ? (
        <View style={styles.section}>
          {activities.map(act => (
            <View key={act.id} style={styles.itemRow}>
              <Text style={styles.itemIcon}>{ACTIVITY_ICONS[act.type] || '📍'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{act.name}</Text>
                {act.cost && formatPrice(act.cost, act.currency || 'EUR') ? (
                  <Text style={styles.itemSub}>{formatPrice(act.cost, act.currency || 'EUR')}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* ─── Randonnées ─── */}
      {hiking.length > 0 ? (
        <View style={styles.section}>
          {hiking.map(act => (
            <View key={act.id} style={styles.itemRow}>
              <Text style={styles.itemIcon}>🥾</Text>
              <Text style={styles.itemName} numberOfLines={1}>{act.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* ─── Ravitaillement ─── */}
      {supermarkets.length > 0 ? (
        <View style={styles.section}>
          {supermarkets.map(act => (
            <View key={act.id} style={styles.itemRow}>
              <Text style={styles.itemIcon}>🛒</Text>
              <Text style={styles.itemName} numberOfLines={1}>{act.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* ─── Notes ─── */}
      {step.notes ? (
        <Text style={styles.stepNotes} numberOfLines={3}>{step.notes}</Text>
      ) : null}

      {/* ─── Budget résumé ─── */}
      {(accomTotal != null || activityTotal != null) ? (
        <View style={styles.budgetRow}>
          {accomTotal != null ? (
            <Text style={styles.budgetItem}>🏨 {formatPrice(accomTotal, accomCurrency)}</Text>
          ) : null}
          {activityTotal != null ? (
            <Text style={styles.budgetItem}>🎯 {formatPrice(activityTotal, 'EUR')}</Text>
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── RouteConnector ───────────────────────────────────────────────────────────

function RouteConnector({ fromStep, toStep, routeKey, route, loading, onCompute }) {
  const canCompute =
    fromStep?.latitude && fromStep?.longitude &&
    toStep?.latitude && toStep?.longitude;

  return (
    <View style={styles.routeConnector}>
      <View style={styles.routeLine} />
      {loading ? (
        <View style={styles.routeChip}>
          <ActivityIndicator color={COLORS.accent} size="small" />
        </View>
      ) : route ? (
        <View style={styles.routeChip}>
          <MaterialIcons name="directions-car" size={11} color={COLORS.accent} />
          <Text style={styles.routeText}>{route.durationText} · {route.distanceText}</Text>
        </View>
      ) : canCompute ? (
        <TouchableOpacity
          style={styles.routeChipBtn}
          onPress={() => onCompute?.(fromStep, toStep, routeKey)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="directions-car" size={11} color={COLORS.textMuted} />
          <Text style={styles.routeCalcText}>Calculer</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.routeChipEmpty}>
          <Text style={styles.routeNoGeo}>→</Text>
        </View>
      )}
      <View style={styles.routeLine} />
    </View>
  );
}

// ─── TableauView ──────────────────────────────────────────────────────────────

export default function TableauView({
  steps,
  routes,
  computingRoutes,
  canEdit,
  onEditStep,
  onComputeRoute,
  topInset = 0,
}) {
  return (
    <ScrollView
      style={[styles.container, { marginTop: topInset }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {steps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune étape pour l'instant.</Text>
        </View>
      ) : (
        steps.map((step, idx) => {
          const nextStep = steps[idx + 1] ?? null;
          const routeKey = nextStep ? `${step.id}→${nextStep.id}` : null;
          const route = routeKey ? (routes[routeKey] ?? null) : null;
          const loading = routeKey ? (computingRoutes[routeKey] ?? false) : false;

          return (
            <View key={step.id}>
              <StepRow
                step={step}
                idx={idx}
                canEdit={canEdit}
                onEditStep={onEditStep}
              />
              {nextStep ? (
                <RouteConnector
                  fromStep={step}
                  toStep={nextStep}
                  routeKey={routeKey}
                  route={route}
                  loading={loading}
                  onCompute={onComputeRoute}
                />
              ) : null}
            </View>
          );
        })
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STEP_BADGE_COLOR = '#1B4332';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },

  // Step card
  stepCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: STEP_BADGE_COLOR,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  stepBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepTitleBlock: { flex: 1, gap: 2 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepTypeIcon: { fontSize: 14 },
  stepName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, lineHeight: 20 },
  stepLocation: { fontSize: 12, color: COLORS.textMuted, marginLeft: 20 },

  // Dates
  datesRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingLeft: 34,
  },
  dateBlock: { gap: 1 },
  dateText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  timeArrival: { fontSize: 11, color: '#4EA8DE' },
  timeDeparture: { fontSize: 11, color: COLORS.accent },
  dateSep: { color: COLORS.textMuted, fontSize: 12 },

  // Sections (hébergement, activités…)
  section: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: SPACING.sm, gap: 6,
    marginLeft: 34,
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  itemIcon: { fontSize: 13, width: 18, marginTop: 1 },
  itemName: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },
  itemSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  // Budget
  budgetRow: {
    flexDirection: 'row', gap: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: SPACING.sm, marginLeft: 34,
  },
  budgetItem: { fontSize: 12, fontWeight: '700', color: COLORS.accent },

  // Notes
  stepNotes: {
    fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic',
    marginLeft: 34,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },

  // Route connector
  routeConnector: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 6, paddingHorizontal: 4,
  },
  routeLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  routeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  routeChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  routeChipEmpty: {
    paddingHorizontal: 10, paddingVertical: 4,
  },
  routeText: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  routeCalcText: { fontSize: 11, color: COLORS.textMuted },
  routeNoGeo: { fontSize: 12, color: COLORS.textDim },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
});
