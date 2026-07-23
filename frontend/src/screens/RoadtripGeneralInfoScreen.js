import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
  // Cohérence
  const [cohGapAfterArrival, setCohGapAfterArrival] = useState('3');
  const [cohGapBeforeDeparture, setCohGapBeforeDeparture] = useState('4');
  const [cohGapBetweenActivities, setCohGapBetweenActivities] = useState('3');
  const [cohMaxArrivalHour, setCohMaxArrivalHour] = useState('21');
  const [cohSleepStart, setCohSleepStart] = useState('23');
  const [cohSleepEnd, setCohSleepEnd] = useState('7');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialiser les champs quand les données PowerSync arrivent
  if (roadtrip && !initialized) {
    setTitle(roadtrip.title ?? '');
    setStartDate(parseDate(roadtrip.startDate));
    setEndDate(roadtrip.endDate ? parseDate(roadtrip.endDate) : null);
    setStatus(roadtrip.status ?? 'DRAFT');
    setBudgetTarget(roadtrip.budgetTarget != null ? String(roadtrip.budgetTarget) : '');
    setFuelConsumption(roadtrip.fuelConsumption != null ? roadtrip.fuelConsumption.toFixed(1) : '');
    setFuelPricePerL(roadtrip.fuelPricePerL != null ? roadtrip.fuelPricePerL.toFixed(2) : '');
    setFuelType(roadtrip.fuelType || 'diesel');
    // Initialiser les seuils de cohérence DEPUIS les settings PowerSync
    try {
      // PowerSync peut double-encoder : on déroule jusqu'à obtenir un objet
      let s = roadtrip.settings || {};
      if (typeof s === 'string') s = JSON.parse(s);
      if (typeof s === 'string') s = JSON.parse(s); // double-encoding
      const c = (s && typeof s === 'object' && !Array.isArray(s)) ? (s.coherence || {}) : {};
      if (c.gapAfterArrival != null) setCohGapAfterArrival(String(c.gapAfterArrival));
      if (c.gapBeforeDeparture != null) setCohGapBeforeDeparture(String(c.gapBeforeDeparture));
      if (c.gapBetweenActivities != null) setCohGapBetweenActivities(String(c.gapBetweenActivities));
      if (c.maxArrivalHour != null) setCohMaxArrivalHour(String(c.maxArrivalHour));
      if (c.sleepStart != null) setCohSleepStart(String(c.sleepStart));
      if (c.sleepEnd != null) setCohSleepEnd(String(c.sleepEnd));
    } catch (_) {}
    setInitialized(true);
  }

  // Backup : si PowerSync met à jour settings plus tard (sync après rendu)
  useEffect(() => {
    if (!roadtrip || !roadtrip.settings) return;
    try {
      let s = roadtrip.settings;
      if (typeof s === 'string') s = JSON.parse(s);
      if (typeof s === 'string') s = JSON.parse(s); // double-encoding
      const c = (s && typeof s === 'object' && !Array.isArray(s)) ? (s.coherence || {}) : {};
      if (c.gapAfterArrival != null) setCohGapAfterArrival(String(c.gapAfterArrival));
      if (c.gapBeforeDeparture != null) setCohGapBeforeDeparture(String(c.gapBeforeDeparture));
      if (c.gapBetweenActivities != null) setCohGapBetweenActivities(String(c.gapBetweenActivities));
      if (c.maxArrivalHour != null) setCohMaxArrivalHour(String(c.maxArrivalHour));
      if (c.sleepStart != null) setCohSleepStart(String(c.sleepStart));
      if (c.sleepEnd != null) setCohSleepEnd(String(c.sleepEnd));
    } catch (_) {}
  }, [roadtrip?.settings]);

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

    let existingSettings = {};
    try {
      let s = roadtrip?.settings || {};
      if (typeof s === 'string') s = JSON.parse(s);
      if (typeof s === 'string') s = JSON.parse(s); // double-encoding
      if (s && typeof s === 'object' && !Array.isArray(s)) existingSettings = s;
    } catch (_) {
      existingSettings = {};
    }

    const payload = {
      title: title.trim(),
      startDate: toLocalDateString(startDate),
      endDate: endDate ? toLocalDateString(endDate) : null,
      status,
      budgetTarget: budgetTarget ? parseFloat(budgetTarget.replace(',', '.')) : null,
      fuelConsumption: fuelConsumption ? parseFloat(fuelConsumption.replace(',', '.')) : null,
      fuelPricePerL: fuelPricePerL ? parseFloat(fuelPricePerL.replace(',', '.')) : null,
      fuelType,
      settings: {
        ...existingSettings,
        coherence: {
          gapAfterArrival: parseFloat(cohGapAfterArrival) || 3,
          gapBeforeDeparture: parseFloat(cohGapBeforeDeparture) || 4,
          gapBetweenActivities: parseFloat(cohGapBetweenActivities) || 3,
          maxArrivalHour: parseFloat(cohMaxArrivalHour) || 21,
          sleepStart: parseInt(cohSleepStart) || 23,
          sleepEnd: parseInt(cohSleepEnd) || 7,
        },
      },
    };

    try {
      await updateRoadtrip(roadtripId, payload);
      navigation.goBack();
    } catch (err) {
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

        {/* ─── Section Cohérence ──────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>🔍 Cohérence du planning</Text>
        </View>
        <Text style={styles.sectionDesc}>Seuils de détection des anomalies temporelles</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Trou max après arrivée (heures)</Text>
          <TextInput
            style={styles.input}
            value={cohGapAfterArrival}
            onChangeText={setCohGapAfterArrival}
            keyboardType="decimal-pad"
            placeholder="3"
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Trou max avant départ (heures)</Text>
          <TextInput
            style={styles.input}
            value={cohGapBeforeDeparture}
            onChangeText={setCohGapBeforeDeparture}
            keyboardType="decimal-pad"
            placeholder="4"
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Trou max entre activités (heures)</Text>
          <TextInput
            style={styles.input}
            value={cohGapBetweenActivities}
            onChangeText={setCohGapBetweenActivities}
            keyboardType="decimal-pad"
            placeholder="3"
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Heure limite d'arrivée</Text>
          <TextInput
            style={styles.input}
            value={cohMaxArrivalHour}
            onChangeText={setCohMaxArrivalHour}
            keyboardType="number-pad"
            placeholder="21"
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Début sommeil (h)</Text>
            <TextInput
              style={styles.input}
              value={cohSleepStart}
              onChangeText={setCohSleepStart}
              keyboardType="number-pad"
              placeholder="23"
              placeholderTextColor={COLORS.textDim}
            />
          </View>
          <View style={{ width: SPACING.md }} />
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Fin sommeil (h)</Text>
            <TextInput
              style={styles.input}
              value={cohSleepEnd}
              onChangeText={setCohSleepEnd}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor={COLORS.textDim}
            />
          </View>
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
  sectionDesc: { fontSize: 12, color: COLORS.textMuted, marginBottom: SPACING.sm },
  row: { flexDirection: 'row' },
});