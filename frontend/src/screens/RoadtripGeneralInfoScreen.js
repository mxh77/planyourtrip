import React, { useState, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import { COLORS, RADIUS, SPACING, ROADTRIP_STATUS } from '../theme';
import { useRoadtripStore } from '../store/roadtripStore';
import DateRangePicker from '../components/DateRangePicker';

const STATUSES = ['DRAFT', 'PLANNED', 'ONGOING', 'COMPLETED'];

const toLocalDateString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function parseDate(str) {
  if (!str) return new Date();
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  if (!y) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
}

export default function RoadtripGeneralInfoScreen({ route, navigation }) {
  const { roadtripId } = route.params;
  const scrollRef = useRef(null);
  const fuelPriceRef = useRef(null);

  // Scroll vers un champ quand il reçoit le focus (clavier)
  const scrollToField = useCallback((y) => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: y - 100, animated: true }), 300);
  }, []);

  // Charger les données depuis PowerSync (réactif)
  const { data: roadtripRows } = useQuery(
    'SELECT * FROM roadtrips WHERE id = ?',
    [roadtripId]
  );
  const roadtrip = roadtripRows?.[0];

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);
  const [status, setStatus] = useState('DRAFT');
  const [budgetTarget, setBudgetTarget] = useState('');
  const [fuelConsumption, setFuelConsumption] = useState('');
  const [fuelPricePerL, setFuelPricePerL] = useState('');
  const [fuelType, setFuelType] = useState('diesel');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialiser les champs quand les données PowerSync arrivent
  if (roadtrip && !initialized) {
    console.log('[GeneralInfo] 📥 PowerSync roadtrip data:', JSON.stringify({
      id: roadtrip.id,
      title: roadtrip.title,
      fuelConsumption: roadtrip.fuelConsumption,
      fuelPricePerL: roadtrip.fuelPricePerL,
      fuelType: roadtrip.fuelType,
      budgetTarget: roadtrip.budgetTarget,
      _raw: roadtrip.fuelPricePerL,
      _type: typeof roadtrip.fuelPricePerL,
    }));
    setTitle(roadtrip.title ?? '');
    setStartDate(parseDate(roadtrip.startDate));
    setEndDate(roadtrip.endDate ? parseDate(roadtrip.endDate) : null);
    setStatus(roadtrip.status ?? 'DRAFT');
    setBudgetTarget(roadtrip.budgetTarget != null ? String(roadtrip.budgetTarget) : '');
    setFuelConsumption(roadtrip.fuelConsumption != null ? roadtrip.fuelConsumption.toFixed(1) : '');
    setFuelPricePerL(roadtrip.fuelPricePerL != null ? roadtrip.fuelPricePerL.toFixed(2) : '');
    setFuelType(roadtrip.fuelType || 'diesel');
    setInitialized(true);
  }

  const { updateRoadtrip } = useRoadtripStore();

  const handleSubmitRef = useRef();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => loading
        ? <ActivityIndicator color={COLORS.accent} style={{ marginRight: SPACING.md }} />
        : (
          <TouchableOpacity onPress={() => handleSubmitRef.current()} style={{ marginRight: SPACING.md }}>
            <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 16 }}>Enregistrer</Text>
          </TouchableOpacity>
        ),
    });
  }, [navigation, loading]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Le titre est obligatoire.');
      return;
    }
    setLoading(true);
    const payload = {
      title: title.trim(),
      startDate: toLocalDateString(startDate),
      endDate: endDate ? toLocalDateString(endDate) : null,
      status,
      budgetTarget: budgetTarget ? parseFloat(budgetTarget.replace(',', '.')) : null,
      fuelConsumption: fuelConsumption ? parseFloat(fuelConsumption.replace(',', '.')) : null,
      fuelPricePerL: fuelPricePerL ? parseFloat(fuelPricePerL.replace(',', '.')) : null,
      fuelType,
    };
    console.log('[GeneralInfo] 🚀 Saving:', JSON.stringify(payload, null, 2));
    try {
      // ⬇️ TOUT via PowerSync (offline-first)
      await updateRoadtrip(roadtripId, payload);
      console.log('[GeneralInfo] ✅ Save success');
      navigation.goBack();
    } catch (err) {
      console.error('[GeneralInfo] ❌ Save error:', err.message, err.stack);
      Alert.alert('Erreur', `Impossible d'enregistrer : ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  handleSubmitRef.current = handleSubmit;

  if (!roadtrip) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.loader}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {/* ─── Titre ─────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Titre *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Nom du voyage..."
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        {/* ─── Dates ──────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Dates du voyage</Text>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => { setStartDate(s); setEndDate(e); }}
          />
        </View>

        {/* ─── Statut ─────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Statut</Text>
          <View style={styles.statusRow}>
            {STATUSES.map((s) => {
              const cfg = ROADTRIP_STATUS[s];
              const active = status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusChip,
                    { borderColor: active ? cfg.color : COLORS.border },
                    active && { backgroundColor: cfg.bg },
                  ]}
                  onPress={() => setStatus(s)}
                >
                  <Text style={[styles.statusChipText, { color: active ? cfg.color : COLORS.textMuted }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ─── Section Budget ──────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>💰 Budget</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Budget prévisionnel (objectif)</Text>
          <TextInput
            style={styles.input}
            value={budgetTarget}
            onChangeText={setBudgetTarget}
            keyboardType="decimal-pad"
            placeholder="Ex: 1500"
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        {/* ─── Section Véhicule ──────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>🚗 Véhicule</Text>
        </View>

        <View style={styles.inputGroup} onLayout={e => { const y = e.nativeEvent.layout.y; fuelPriceRef.current = y; }}>
          <Text style={styles.label}>Consommation (L/100km)</Text>
          <TextInput
            style={styles.input}
            value={fuelConsumption}
            onChangeText={setFuelConsumption}
            keyboardType="decimal-pad"
            placeholder="Ex: 7.5"
            placeholderTextColor={COLORS.textDim}
            onFocus={() => scrollToField(fuelPriceRef.current || 500)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Type de carburant</Text>
          <View style={styles.statusRow}>
            {[
              { key: 'diesel', label: '⛽ Diesel' },
              { key: 'sp95', label: '⛽ SP95' },
              { key: 'sp98', label: '⛽ SP98' },
              { key: 'electric', label: '⚡ Électrique' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.statusChip,
                  { borderColor: fuelType === opt.key ? '#f59e0b' : COLORS.border },
                  fuelType === opt.key && { backgroundColor: 'rgba(245,158,11,0.1)' },
                ]}
                onPress={() => setFuelType(opt.key)}
              >
                <Text style={[styles.statusChipText, { color: fuelType === opt.key ? '#f59e0b' : COLORS.textMuted }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup} onLayout={e => { fuelPriceRef.current = e.nativeEvent.layout.y; }}>
          <Text style={styles.label}>Prix estimé du litre (€)</Text>
          <TextInput
            style={styles.input}
            value={fuelPricePerL}
            onChangeText={setFuelPricePerL}
            keyboardType="decimal-pad"
            placeholder="Ex: 1.85"
            placeholderTextColor={COLORS.textDim}
            onFocus={() => scrollToField(fuelPriceRef.current || 600)}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 200 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inputGroup: { gap: SPACING.xs },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  statusChip: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  statusChipText: { fontSize: 13, fontWeight: '600' },
  sectionHeader: { marginTop: SPACING.md, marginBottom: SPACING.xs },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 1 },
});