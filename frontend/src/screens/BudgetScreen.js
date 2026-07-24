import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, Pressable,
  Dimensions, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useRoadtripStore } from '../store/roadtripStore';
import { useExpenses } from '../hooks/usePowerSync';
import API_URL from '../api/config';
import client from '../api/client';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Constantes ──────────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  FUEL:      { icon: '⛽', label: 'Essence',      color: '#f59e0b' },
  TOLL:      { icon: '🛣️', label: 'Péage',        color: '#3b82f6' },
  FOOD:      { icon: '🍽️', label: 'Repas',        color: '#22c55e' },
  PARKING:   { icon: '🅿️', label: 'Parking',      color: '#a855f7' },
  EQUIPMENT: { icon: '🎒', label: 'Équipement',   color: '#ec4899' },
  INSURANCE: { icon: '🛡️', label: 'Assurance',    color: '#14b8a6' },
  OTHER:     { icon: '📌', label: 'Autre',        color: '#6b7280' },
};

const ALL_CATEGORIES = Object.entries(CATEGORY_CONFIG).map(([key, val]) => ({
  key, ...val,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(amount, currency = 'EUR') {
  if (amount == null || isNaN(amount)) return '—';
  try {
    return amount.toLocaleString('fr-FR', {
      style: 'currency', currency: currency || 'EUR',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return '—';
  return `${Math.min(100, Math.round(val))}%`;
}

// ─── BudgetScreen ────────────────────────────────────────────────────────────

export default function BudgetScreen({ route, navigation }) {
  const { roadtripId, roadtripTitle } = route.params;
  const token = useAuthStore(s => s.token);
  const { createExpense, updateExpense, deleteExpense } = useRoadtripStore();

  // ── Données PowerSync ─────────────────────────────────────────────────
  const { data: roadtripRows } = useQuery(
    roadtripId
      ? 'SELECT * FROM roadtrips WHERE id = ?'
      : 'SELECT * FROM roadtrips WHERE 1=0',
    roadtripId ? [roadtripId] : []
  );
  const roadtrip = roadtripRows?.[0] ?? null;

  const { data: stepsData } = useQuery(
    roadtripId
      ? 'SELECT * FROM steps WHERE roadtripId = ? ORDER BY "order" ASC'
      : 'SELECT * FROM steps WHERE 1=0',
    roadtripId ? [roadtripId] : []
  );
  const steps = stepsData ?? [];

  const { data: accomData } = useQuery(
    roadtripId
      ? `SELECT a.*, s.name as stepName, s."order" as stepOrder
         FROM accommodations a
         JOIN steps s ON s.id = a.stepId
         WHERE s.roadtripId = ?
         ORDER BY s."order" ASC`
      : 'SELECT * FROM accommodations WHERE 1=0',
    roadtripId ? [roadtripId] : []
  );

  const { data: activityData } = useQuery(
    roadtripId
      ? `SELECT act.*, s.name as stepName, s."order" as stepOrder
         FROM activities act
         JOIN steps s ON s.id = act.stepId
         WHERE s.roadtripId = ?
         ORDER BY s."order" ASC`
      : 'SELECT * FROM activities WHERE 1=0',
    roadtripId ? [roadtripId] : []
  );

  const { expenses, isLoading: expLoading } = useExpenses(roadtripId);

  // ── Agrégation locale (offline-first, réactif) ───────────────────────
  const localData = useMemo(() => {
    // Hébergements
    let accomTotal = 0, accomDeposits = 0, accomCount = 0;
    const byStepAccom = {};
    (accomData ?? []).forEach(a => {
      const nights = a.checkIn && a.checkOut
        ? Math.max(1, Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 86400000))
        : 1;
      const total = a.totalPrice || (a.pricePerNight ? a.pricePerNight * nights : 0);
      accomTotal += total;
      accomDeposits += a.depositPaid || 0;
      accomCount++;
      if (total > 0) byStepAccom[a.stepId] = (byStepAccom[a.stepId] || 0) + total;
    });

    // Activités
    let activityTotal = 0, activityDeposits = 0, activityCount = 0;
    const byStepActivity = {};
    (activityData ?? []).forEach(act => {
      activityTotal += act.cost || 0;
      activityDeposits += act.depositPaid || 0;
      activityCount++;
      if (act.cost) byStepActivity[act.stepId] = (byStepActivity[act.stepId] || 0) + act.cost;
    });

    // Dépenses custom
    const expTotal = (expenses ?? []).reduce((s, e) => s + (e.amount || 0), 0);
    const expPaid = (expenses ?? []).filter(e => e.paid).reduce((s, e) => s + (e.amount || 0), 0);
    const expensesByCategory = {};
    (expenses ?? []).forEach(e => {
      const cat = e.category || 'OTHER';
      if (!expensesByCategory[cat]) expensesByCategory[cat] = { total: 0, count: 0 };
      expensesByCategory[cat].total += e.amount || 0;
      expensesByCategory[cat].count++;
    });

    // Budget par étape
    const budgetByStep = steps.map(step => {
      const accom = byStepAccom[step.id] || 0;
      const activities_ = byStepActivity[step.id] || 0;
      const stepExp = (expenses ?? []).filter(e => e.stepId === step.id).reduce((s, e) => s + (e.amount || 0), 0);
      return {
        stepId: step.id, stepName: step.name, stepOrder: step.order,
        accommodation: accom, activities: activities_,
        expenses: stepExp, total: accom + activities_ + stepExp,
      };
    });

    // Essence (estimée localement depuis PowerSync + fallback API)
    const totalKm = steps.reduce((s, step) => s + (parseInt(step.routeDistanceMeters) || 0), 0) / 1000;
    const fuelConsumption = roadtrip?.fuelConsumption ? parseFloat(roadtrip.fuelConsumption) : null;
    const fuelPricePerL = roadtrip?.fuelPricePerL ? parseFloat(roadtrip.fuelPricePerL) : null;
    let estimatedFuelCost = null;
    // ⬇️ Si les données PowerSync sont disponibles (routeDistanceMeters synced), les utiliser
    // ⬇️ Sinon, on utilisera le fallback API plus bas
    if (fuelConsumption && fuelPricePerL && totalKm > 0) {
      estimatedFuelCost = Math.round((totalKm / 100) * fuelConsumption * fuelPricePerL * 100) / 100;
    }

    const grandTotal = accomTotal + activityTotal + expTotal + (estimatedFuelCost || 0);
    const totalPaid = accomDeposits + activityDeposits + expPaid;

    return {
      summary: {
        grandTotal,
        totalPaid,
        balance: grandTotal - totalPaid,
        balancePercent: grandTotal > 0 ? Math.round((totalPaid / grandTotal) * 100) : 0,
        budgetTarget: roadtrip?.budgetTarget ?? null,
        budgetCurrency: roadtrip?.budgetCurrency || 'EUR',
        budgetUsedPercent: roadtrip?.budgetTarget && grandTotal > 0
          ? Math.min(100, Math.round((grandTotal / roadtrip.budgetTarget) * 100))
          : null,
        remainingBudget: roadtrip?.budgetTarget
          ? Math.max(0, roadtrip.budgetTarget - grandTotal)
          : null,
      },
      breakdown: {
        accommodation: { total: accomTotal, deposits: accomDeposits, count: accomCount },
        activities: { total: activityTotal, deposits: activityDeposits, count: activityCount },
        expenses: { total: expTotal, paid: expPaid, byCategory: expensesByCategory },
        fuel: {
          estimated: estimatedFuelCost,
          totalKm: Math.round(totalKm * 10) / 10,
          consumption: fuelConsumption,
          fuelType: roadtrip?.fuelType || null,
          fuelPricePerL,
        },
      },
      byStep: budgetByStep,
      settings: {
        budgetTarget: roadtrip?.budgetTarget ?? null,
        budgetCurrency: roadtrip?.budgetCurrency || 'EUR',
        fuelConsumption,
        fuelType: roadtrip?.fuelType || null,
        fuelPricePerL,
      },
    };
  }, [roadtrip, steps, accomData, activityData, expenses]);

  // ── Synchro API (pour les distances réelles depuis PostgreSQL) ───────
  const [budgetData, setBudgetData] = useState(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBudget = useCallback(async () => {
    if (!token || !roadtripId) return;
    try {
      if (!refreshing) setApiLoading(true); // premier chargement
      const res = await client.get(`/api/roadtrips/${roadtripId}/budget`);
      if (res.data?.breakdown?.fuel) {
        setBudgetData(res.data);
      }
    } catch (e) {
      console.error('[Budget] Fetch error:', e.message);
    } finally {
      setApiLoading(false);
      setRefreshing(false);
    }
  }, [roadtripId, token]);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBudget();
  }, [fetchBudget]);

  // ── Fusion : local (réactif) + API (distances réelles PostgreSQL) ────
  const fuelFromApi = budgetData?.breakdown?.fuel;
  const hasApiFuel = fuelFromApi?.totalKm != null && fuelFromApi?.totalKm > 0;

  const summary = localData.summary;
  const breakdown = {
    ...localData.breakdown,
    fuel: hasApiFuel ? fuelFromApi : localData.breakdown.fuel,
  };
  const byStep = localData.byStep;
  const settings = localData.settings;

  // ── Modal ajout dépense ──────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [form, setForm] = useState({
    label: '', category: 'OTHER', amount: '', currency: 'EUR',
    paid: false, stepId: '', date: '', notes: '',
  });

  const openAddModal = (prefillCategory) => {
    setEditExpense(null);
    setForm({
      label: '', category: prefillCategory || 'OTHER', amount: '', currency: 'EUR',
      paid: false, stepId: '', date: new Date().toISOString().slice(0, 10), notes: '',
    });
    setShowAddModal(true);
  };

  const openEditModal = (exp) => {
    setEditExpense(exp);
    setForm({
      label: exp.label || '',
      category: exp.category || 'OTHER',
      amount: exp.amount != null ? String(exp.amount) : '',
      currency: exp.currency || 'EUR',
      paid: exp.paid ? true : false,
      stepId: exp.stepId || '',
      date: exp.date ? exp.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: exp.notes || '',
    });
    setShowAddModal(true);
  };

  const handleSaveExpense = async () => {
    if (!form.label.trim() || !form.amount) {
      Alert.alert('Champs requis', 'Le libellé et le montant sont obligatoires');
      return;
    }
    const data = {
      roadtripId,
      label: form.label.trim(),
      category: form.category,
      amount: parseFloat(form.amount.replace(',', '.')),
      currency: form.currency || 'EUR',
      paid: form.paid,
      stepId: form.stepId || null,
      date: form.date || null,
      notes: form.notes || null,
    };

    try {
      if (editExpense) {
        await updateExpense(editExpense.id, data);
      } else {
        await createExpense(data);
      }
      setShowAddModal(false);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la dépense');
    }
  };

  const handleDeleteExpense = (exp) => {
    Alert.alert(
      'Supprimer',
      `Supprimer "${exp.label}" (${formatPrice(exp.amount, exp.currency)}) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await deleteExpense(exp.id);
          },
        },
      ]
    );
  };

  // ── Navigation ───────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: 'Budget',
    });
  }, [navigation]);

  // PowerSync réactif = pas besoin d'attendre l'API pour afficher
  if (!roadtrip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ═══ CARD RÉSUMÉ ═══ */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>💰 Budget total</Text>
            <Text style={styles.summaryAmount}>{formatPrice(summary.grandTotal, summary.budgetCurrency || 'EUR')}</Text>
          </View>

          {/* Barre de progression budget target */}
          {summary.budgetTarget != null && summary.budgetTarget > 0 && (
            <View style={styles.targetBarContainer}>
              <View style={styles.targetBarBg}>
                <View style={[
                  styles.targetBarFill,
                  {
                    width: `${Math.min(100, (summary.grandTotal / summary.budgetTarget) * 100)}%`,
                    backgroundColor: summary.budgetUsedPercent > 90 ? '#ef4444'
                      : summary.budgetUsedPercent > 75 ? '#f59e0b'
                      : '#22c55e',
                  },
                ]} />
              </View>
              <Text style={styles.targetBarText}>
                {fmtPct(summary.budgetUsedPercent)} · {formatPrice(summary.remainingBudget, summary.budgetCurrency)} restant
              </Text>
            </View>
          )}

          {/* Solde */}
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>💳 Payé</Text>
              <Text style={[styles.balanceValue, { color: '#22c55e' }]}>
                {formatPrice(summary.totalPaid, summary.budgetCurrency || 'EUR')}
              </Text>
            </View>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>📅 Reste</Text>
              <Text style={[styles.balanceValue, {
                color: summary.balance > 0 ? '#ef4444' : '#22c55e',
              }]}>
                {formatPrice(Math.max(summary.balance, 0), summary.budgetCurrency || 'EUR')}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ RÉPARTITION PAR CATÉGORIE ═══ */}
        {breakdown && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Répartition</Text>

            {/* Barres horizontales */}
            {[
              { key: 'Hébergement', icon: '🏨', total: breakdown.accommodation.total, color: '#3b82f6' },
              { key: 'Activités', icon: '🎯', total: breakdown.activities.total, color: '#a855f7' },
              ...Object.entries(breakdown.expenses.byCategory).map(([cat, data]) => ({
                key: CATEGORY_CONFIG[cat]?.label || cat,
                icon: CATEGORY_CONFIG[cat]?.icon || '📌',
                total: data.total,
                color: CATEGORY_CONFIG[cat]?.color || '#6b7280',
              })),
              ...(breakdown.fuel?.estimated
                ? [{ key: 'Essence estim.', icon: '⛽', total: breakdown.fuel.estimated, color: '#f59e0b' }]
                : []),
            ]
              .filter(item => item.total > 0)
              .sort((a, b) => b.total - a.total)
              .map((item, idx) => {
                const pct = summary.grandTotal > 0
                  ? Math.round((item.total / summary.grandTotal) * 100)
                  : 0;
                return (
                  <View key={idx} style={styles.categoryRow}>
                    <Text style={styles.categoryIcon}>{item.icon}</Text>
                    <View style={styles.categoryInfo}>
                      <View style={styles.categoryHeader}>
                        <Text style={styles.categoryLabel} numberOfLines={1}>{item.key}</Text>
                        <Text style={styles.categoryAmount}>{formatPrice(item.total, 'EUR')}</Text>
                      </View>
                      <View style={styles.categoryBarBg}>
                        <View style={[styles.categoryBarFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                      </View>
                      <Text style={styles.categoryPct}>{pct}%</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* ═══ BUDGET PAR ÉTAPE ═══ */}
        {byStep && byStep.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📈 Budget par étape</Text>
            {byStep.map((s, idx) => {
              const maxTotal = Math.max(...byStep.map(x => x.total), 1);
              const pct = (s.total / maxTotal) * 100;
              return (
                <View key={s.stepId} style={styles.stepBudgetRow}>
                  <View style={styles.stepBudgetHeader}>
                    <View style={styles.stepBudgetBadge}>
                      <Text style={styles.stepBudgetBadgeText}>{s.stepOrder != null ? s.stepOrder + 1 : idx + 1}</Text>
                    </View>
                    <Text style={styles.stepBudgetName} numberOfLines={1}>{s.stepName}</Text>
                    <Text style={styles.stepBudgetAmount}>{formatPrice(s.total, 'EUR')}</Text>
                  </View>
                  <View style={styles.stepBudgetBarBg}>
                    <View style={[styles.stepBudgetBarFill, { width: `${pct}%` }]} />
                  </View>
                  {s.total > 0 && (
                    <View style={styles.stepBudgetDetails}>
                      {s.accommodation > 0 && <Text style={styles.stepBudgetDetail}>🏨 {formatPrice(s.accommodation)}</Text>}
                      {s.activities > 0 && <Text style={styles.stepBudgetDetail}>🎯 {formatPrice(s.activities)}</Text>}
                      {s.expenses > 0 && <Text style={styles.stepBudgetDetail}>📌 {formatPrice(s.expenses)}</Text>}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ ESTIMATION ESSENCE ═══ */}
        {breakdown?.fuel && (
          <TouchableOpacity
            style={styles.section}
            onPress={() => navigation.navigate('RoadtripGeneralInfo', { roadtripId })}
          >
            <Text style={styles.sectionTitle}>⛽ Estimation essence</Text>
            <View style={styles.fuelRow}>
              <Text style={styles.fuelLabel}>Distance totale</Text>
              <Text style={styles.fuelValue}>{breakdown.fuel.totalKm} km</Text>
            </View>
            {breakdown.fuel.estimated != null && (
              <>
                <View style={styles.fuelRow}>
                  <Text style={styles.fuelLabel}>Consommation</Text>
                  <Text style={styles.fuelValue}>{(parseFloat(breakdown.fuel.consumption) || 0).toFixed(1)} L/100km</Text>
                </View>
                <View style={styles.fuelRow}>
                  <Text style={styles.fuelLabel}>Prix au litre</Text>
                  <Text style={styles.fuelValue}>{(parseFloat(breakdown.fuel.fuelPricePerL) || 0).toFixed(2)} €/L</Text>
                </View>
                <View style={[styles.fuelRow, styles.fuelTotalRow]}>
                  <Text style={styles.fuelTotalLabel}>⛽ Coût estimé</Text>
                  <Text style={styles.fuelTotalValue}>{formatPrice(breakdown.fuel.estimated)}</Text>
                </View>
              </>
            )}
            {!breakdown.fuel.consumption && (
              <Text style={styles.fuelHint}>
                Définissez la consommation et le prix du carburant dans les paramètres du roadtrip
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ═══ DÉPENSES CUSTOM ═══ */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📋 Dépenses</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openAddModal()}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {/* Quick-add par catégorie */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickAddRow}>
            {ALL_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={styles.quickAddChip}
                onPress={() => openAddModal(cat.key)}
              >
                <Text style={styles.quickAddChipIcon}>{cat.icon}</Text>
                <Text style={styles.quickAddChipLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Liste des dépenses */}
          {(expenses ?? []).length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune dépense pour l'instant.{'\n'}Ajoutez de l'essence, des péages, etc.
            </Text>
          ) : (
            (expenses ?? [])
              .sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''))
              .map(exp => {
                const catCfg = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.OTHER;
                const stepName = steps.find(s => s.id === exp.stepId)?.name || null;
                return (
                  <TouchableOpacity
                    key={exp.id}
                    style={styles.expenseRow}
                    onPress={() => openEditModal(exp)}
                    onLongPress={() => handleDeleteExpense(exp)}
                  >
                    <View style={[styles.expenseIcon, { backgroundColor: catCfg.color + '20' }]}>
                      <Text style={styles.expenseIconText}>{catCfg.icon}</Text>
                    </View>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseLabel} numberOfLines={1}>{exp.label}</Text>
                      <Text style={styles.expenseMeta}>
                        {stepName ? `📍 ${stepName}  ·  ` : ''}
                        {exp.date ? formatDate(exp.date) : ''}
                        {exp.paid ? '  ✅ Payé' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.expenseAmount, exp.paid && styles.expenseAmountPaid]}>
                      {formatPrice(exp.amount, exp.currency)}
                    </Text>
                  </TouchableOpacity>
                );
              })
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ═══ MODAL AJOUT / ÉDITION DÉPENSE ═══ */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editExpense ? 'Modifier' : 'Ajouter'} une dépense</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Catégorie */}
              <Text style={styles.modalLabel}>Catégorie</Text>
              <View style={styles.categoryPicker}>
                {ALL_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryChip,
                      form.category === cat.key && { backgroundColor: cat.color + '30', borderColor: cat.color },
                    ]}
                    onPress={() => setForm(f => ({ ...f, category: cat.key }))}
                  >
                    <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                    <Text style={[styles.categoryChipLabel, form.category === cat.key && { color: cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Libellé */}
              <Text style={styles.modalLabel}>Libellé</Text>
              <TextInput
                style={styles.modalInput}
                value={form.label}
                onChangeText={v => setForm(f => ({ ...f, label: v }))}
                placeholder="Ex: Station Total — A75"
                placeholderTextColor={COLORS.textDim}
              />

              {/* Montant + Devise */}
              <View style={styles.modalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Montant</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={form.amount}
                    onChangeText={v => setForm(f => ({ ...f, amount: v.replace(',', '.') }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View>
                  <Text style={styles.modalLabel}>Devise</Text>
                  <View style={styles.currencyPicker}>
                    {['EUR', 'CHF', 'GBP', 'USD'].map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.currencyChip, form.currency === c && styles.currencyChipActive]}
                        onPress={() => setForm(f => ({ ...f, currency: c }))}
                      >
                        <Text style={[styles.currencyChipText, form.currency === c && styles.currencyChipTextActive]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Payé */}
              <TouchableOpacity
                style={styles.paidToggle}
                onPress={() => setForm(f => ({ ...f, paid: !f.paid }))}
              >
                <MaterialIcons
                  name={form.paid ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={form.paid ? '#22c55e' : COLORS.textDim}
                />
                <Text style={[styles.paidToggleLabel, form.paid && { color: '#22c55e' }]}>
                  Déjà payé
                </Text>
              </TouchableOpacity>

              {/* Étape associée */}
              <Text style={styles.modalLabel}>Étape (optionnel)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stepPicker}>
                <TouchableOpacity
                  style={[styles.stepChip, !form.stepId && styles.stepChipActive]}
                  onPress={() => setForm(f => ({ ...f, stepId: '' }))}
                >
                  <Text style={[styles.stepChipText, !form.stepId && styles.stepChipTextActive]}>
                    🌍 Global
                  </Text>
                </TouchableOpacity>
                {steps.map((s, i) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.stepChip, form.stepId === s.id && styles.stepChipActive]}
                    onPress={() => setForm(f => ({ ...f, stepId: s.id }))}
                  >
                    <Text style={[styles.stepChipText, form.stepId === s.id && styles.stepChipTextActive]}>
                      {i + 1}. {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Date */}
              <Text style={styles.modalLabel}>Date</Text>
              <TextInput
                style={styles.modalInput}
                value={form.date}
                onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textDim}
              />

              {/* Notes */}
              <Text style={styles.modalLabel}>Notes (optionnel)</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Infos complémentaires…"
                placeholderTextColor={COLORS.textDim}
                multiline
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveExpense}>
                <Text style={styles.saveBtnText}>
                  {editExpense ? '💾 Enregistrer' : '➕ Ajouter'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14 },
  scrollContent: { padding: SPACING.md, paddingBottom: 40 },

  // ── Summary Card ──
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(232,164,53,0.2)',
  },
  summaryHeader: { alignItems: 'center', marginBottom: SPACING.sm },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  summaryAmount: { fontSize: 36, fontWeight: '800', color: '#E8A435' },
  targetBarContainer: { marginBottom: SPACING.md },
  targetBarBg: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, overflow: 'hidden', marginBottom: 4,
  },
  targetBarFill: { height: '100%', borderRadius: 4 },
  targetBarText: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: SPACING.md,
  },
  balanceItem: { alignItems: 'center' },
  balanceLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  balanceValue: { fontSize: 18, fontWeight: '700' },

  // ── Section ──
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: SPACING.sm },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  // ── Catégories ──
  categoryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  categoryIcon: { fontSize: 18, width: 30, textAlign: 'center' },
  categoryInfo: { flex: 1, marginLeft: 8 },
  categoryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  categoryLabel: { fontSize: 13, color: '#fff', flex: 1 },
  categoryAmount: { fontSize: 13, fontWeight: '600', color: '#E8A435' },
  categoryBarBg: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2, overflow: 'hidden',
  },
  categoryBarFill: { height: '100%', borderRadius: 2 },
  categoryPct: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },

  // ── Budget par étape ──
  stepBudgetRow: { marginBottom: SPACING.sm },
  stepBudgetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepBudgetBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(232,164,53,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  stepBudgetBadgeText: { fontSize: 11, fontWeight: '700', color: '#E8A435' },
  stepBudgetName: { flex: 1, fontSize: 13, color: '#fff' },
  stepBudgetAmount: { fontSize: 13, fontWeight: '600', color: '#E8A435' },
  stepBudgetBarBg: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2, overflow: 'hidden',
  },
  stepBudgetBarFill: { height: '100%', borderRadius: 2, backgroundColor: '#E8A435' },
  stepBudgetDetails: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginTop: 4, marginLeft: 30,
  },
  stepBudgetDetail: { fontSize: 11, color: COLORS.textMuted },

  // ── Essence ──
  fuelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  fuelLabel: { fontSize: 13, color: '#ccc' },
  fuelValue: { fontSize: 13, fontWeight: '600', color: '#fff' },
  fuelTotalRow: { borderBottomWidth: 0, marginTop: 4 },
  fuelTotalLabel: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
  fuelTotalValue: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
  fuelHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, fontStyle: 'italic' },

  // ── Ajout rapide ──
  addBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8A435', paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: RADIUS.md, gap: 4,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  quickAddRow: { marginBottom: SPACING.sm },
  quickAddChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: RADIUS.full, marginRight: 8, gap: 4,
  },
  quickAddChipIcon: { fontSize: 14 },
  quickAddChipLabel: { fontSize: 12, color: '#ccc' },

  // ── Liste dépenses ──
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20, lineHeight: 20 },
  expenseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  expenseIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  expenseIconText: { fontSize: 16 },
  expenseInfo: { flex: 1 },
  expenseLabel: { fontSize: 14, color: '#fff', fontWeight: '500' },
  expenseMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  expenseAmount: { fontSize: 14, fontWeight: '700', color: '#E8A435' },
  expenseAmountPaid: { color: '#22c55e' },

  // ── Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.md, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  modalBody: { padding: SPACING.md, maxHeight: 400 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase' },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.md,
    padding: 12, fontSize: 15,
    color: '#fff', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  modalRow: { flexDirection: 'row', alignItems: 'flex-end' },
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'transparent', gap: 4,
  },
  categoryChipIcon: { fontSize: 14 },
  categoryChipLabel: { fontSize: 12, color: '#ccc' },
  currencyPicker: { flexDirection: 'row', gap: 6 },
  currencyChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  currencyChipActive: { backgroundColor: 'rgba(232,164,53,0.2)' },
  currencyChipText: { fontSize: 13, color: '#ccc' },
  currencyChipTextActive: { color: '#E8A435', fontWeight: '700' },
  paidToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingVertical: 8,
  },
  paidToggleLabel: { fontSize: 14, color: COLORS.textMuted },
  stepPicker: { flexDirection: 'row', marginBottom: 8 },
  stepChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  stepChipActive: { backgroundColor: 'rgba(232,164,53,0.2)' },
  stepChipText: { fontSize: 12, color: '#ccc' },
  stepChipTextActive: { color: '#E8A435', fontWeight: '600' },
  modalFooter: {
    padding: SPACING.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  saveBtn: {
    backgroundColor: '#E8A435',
    paddingVertical: 14, borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
