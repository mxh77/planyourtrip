import React, { useState, useLayoutEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function EditRoadtripScreen({ route, navigation }) {
  const { roadtrip } = route.params;

  const parseDate = (str) => {
    if (!str) return new Date();
    const d = new Date(str);
    if (isNaN(d.getTime())) return new Date();
    // Normaliser à midi heure locale pour éviter le décalage UTC→local
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  };

  const [title, setTitle] = useState(roadtrip.title ?? '');
  const [startDate, setStartDate] = useState(parseDate(roadtrip.startDate));
  const [endDate, setEndDate] = useState(parseDate(roadtrip.endDate));
  const [status, setStatus] = useState(roadtrip.status ?? 'DRAFT');
  const [loading, setLoading] = useState(false);

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
      await updateRoadtrip(roadtrip.id, {
        title: title.trim(),
        startDate: toLocalDateString(startDate),
        endDate: toLocalDateString(endDate),
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
            placeholder="Road trip en Écosse..."
            placeholderTextColor={COLORS.textDim}
            autoFocus
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
  row: { flexDirection: 'row', gap: SPACING.md },
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
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 16 },
});
