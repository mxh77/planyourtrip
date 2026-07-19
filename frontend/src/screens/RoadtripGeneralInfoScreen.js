import React, { useState, useLayoutEffect, useRef } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialiser les champs quand les données PowerSync arrivent
  if (roadtrip && !initialized) {
    setTitle(roadtrip.title ?? '');
    setStartDate(parseDate(roadtrip.startDate));
    setEndDate(roadtrip.endDate ? parseDate(roadtrip.endDate) : null);
    setStatus(roadtrip.status ?? 'DRAFT');
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
    try {
      await updateRoadtrip(roadtripId, {
        title: title.trim(),
        startDate: toLocalDateString(startDate),
        endDate: endDate ? toLocalDateString(endDate) : null,
        status,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de modifier le roadtrip.');
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, gap: SPACING.md },
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
});