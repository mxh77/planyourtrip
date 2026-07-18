import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Types de lieux Google Places disponibles pour les suggestions.
 * On map sur les types réels de l'API Google Places Nearby Search.
 */
const PLACE_TYPE_OPTIONS_LODGING = [
  { key: 'hotel',             label: 'Hôtel',           icon: '🏨' },
  { key: 'campground',        label: 'Camping',          icon: '⛺' },
  { key: 'parking',           label: 'Parking',          icon: '🅿️' },
];

const PLACE_TYPE_OPTIONS_ACTIVITY = [
  { key: 'restaurant',          label: 'Restaurant',          icon: '🍽️' },
  { key: 'cafe',                label: 'Café',                icon: '☕' },
  { key: 'bar',                 label: 'Bar',                 icon: '🍺' },
  { key: 'cultural_center',     label: 'Attraction',          icon: '🎭' },
  { key: 'museum',              label: 'Musée',               icon: '🏗️' },
  { key: 'park',                label: 'Parc',                icon: '🌳' },
  { key: 'amusement_park',      label: 'Parc d\'attractions',  icon: '🎡' },
  { key: 'art_gallery',         label: 'Galerie d\'art',      icon: '🖼️' },
  { key: 'department_store',   label: 'Shopping',            icon: '🛍️' },
  { key: 'supermarket',         label: 'Supermarché',        icon: '�' },
  { key: 'spa',                 label: 'Spa / Bien-être',     icon: '💆' },
  { key: 'gym',                 label: 'Sport / Gym',         icon: '🏋️' },
  { key: 'hiking_area',         label: 'Randonnée',           icon: '🥾' },  { key: 'transit_station',     label: 'Transport',           icon: '🚌' },];

const RADIUS_OPTIONS = [
  { value: 1000,  label: '1 km' },
  { value: 5000,  label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 20000, label: '20 km' },
];

// Valeurs par défaut si aucun settings n'existe encore
const DEFAULT_SETTINGS = {
  suggestionPlaceTypes: ['hotel', 'campground', 'restaurant', 'cultural_center', 'museum', 'park'],
  suggestionRadius: 1000,
};

// ─── Composants UI ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function Chip({ label, icon, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function ComingSoonSection({ icon, title }) {
  return (
    <View style={styles.comingSoon}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.comingSoonText}>À venir</Text>
      </View>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function RoadtripSettingsScreen({ navigation, route }) {
  const { roadtripId } = route.params;
  const { bottom } = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);

  // ─── Chargement ─────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch {
      // On garde les valeurs par défaut silencieusement
    } finally {
      setLoading(false);
    }
  }, [roadtripId, token]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ─── Sauvegarde ─────────────────────────────────────────────────────────────

  const save = useCallback(async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres.');
      // rollback
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }, [roadtripId, token, settings]);

  // ─── Clone ───────────────────────────────────────────────────────────────────

  const handleClone = useCallback(() => {
    Alert.alert(
      'Cloner ce roadtrip',
      'Une copie complète (étapes, hébergements, activités) sera créée dans vos roadtrips.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Cloner',
          onPress: async () => {
            setCloning(true);
            try {
              const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/clone`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error();
              const cloned = await res.json();
              navigation.replace('RoadtripDetail', {
                id: cloned.id,
                title: cloned.title,
                roadtripData: cloned,
              });
            } catch {
              Alert.alert('Erreur', 'Impossible de cloner le roadtrip.');
            } finally {
              setCloning(false);
            }
          },
        },
      ]
    );
  }, [roadtripId, token, navigation]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const togglePlaceType = useCallback((key) => {
    const current = settings.suggestionPlaceTypes ?? [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    save({ suggestionPlaceTypes: next });
  }, [settings.suggestionPlaceTypes, save]);

  const selectRadius = useCallback((value) => {
    save({ suggestionRadius: value });
  }, [save]);

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const selectedTypes = settings.suggestionPlaceTypes ?? [];
  const selectedRadius = settings.suggestionRadius ?? 1500;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        {saving ? (
          <ActivityIndicator color={COLORS.accent} size="small" style={{ marginRight: SPACING.sm }} />
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(bottom, SPACING.xl) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 1 : Suggestions ──────────────────────────────────────── */}
        <SectionHeader
          icon="🔍"
          title="Suggestions de lieux"
          subtitle="Types de lieux affichés dans la recherche à proximité de chaque étape"
        />

        {/* Groupe hébergements */}
        <Text style={styles.groupLabel}>🏨 Hébergements</Text>
        <Text style={styles.groupHint}>Affichés uniquement sur les étapes (pas les arrêts)</Text>
        <View style={styles.chipsContainer}>
          {PLACE_TYPE_OPTIONS_LODGING.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              icon={opt.icon}
              selected={selectedTypes.includes(opt.key)}
              onPress={() => togglePlaceType(opt.key)}
            />
          ))}
        </View>

        {/* Groupe lieux & activités */}
        <Text style={styles.groupLabel}>📍 Lieux & activités</Text>
        <Text style={styles.groupHint}>Affichés sur les étapes et les arrêts</Text>
        <View style={styles.chipsContainer}>
          {PLACE_TYPE_OPTIONS_ACTIVITY.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              icon={opt.icon}
              selected={selectedTypes.includes(opt.key)}
              onPress={() => togglePlaceType(opt.key)}
            />
          ))}
        </View>

        <Text style={styles.label}>Rayon de recherche</Text>
        <View style={styles.radiusRow}>
          {RADIUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.radiusBtn, selectedRadius === opt.value && styles.radiusBtnSelected]}
              onPress={() => selectRadius(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.radiusBtnText, selectedRadius === opt.value && styles.radiusBtnTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Divider />

        {/* ── Section 2 : Boutons de recherche rapide ─────────────────────── */}
        <SectionHeader
          icon="🔘"
          title="Boutons de recherche rapide"
          subtitle="Boutons affichés sous la barre de recherche sur la carte"
        />

        {/* Catégories prédéfinies (toujours disponibles) */}
        <Text style={styles.groupLabel}>🏕️ Catégories principales</Text>
        <Text style={styles.groupHint}>Toujours visibles dans la barre de recherche</Text>

        {/* Ces catégories sont fixes mais on pourrait les rendre configurables plus tard */}

        {/* Types supplémentaires (ceux cochés apparaîtront comme boutons) */}
        <Text style={styles.groupLabel}>➕ Types supplémentaires</Text>
        <Text style={styles.groupHint}>Cochez les types à ajouter comme boutons dédiés</Text>
        <View style={styles.chipsContainer}>
          {[
            { key: 'restaurant', icon: '🍽️', label: 'Restaurants' },
            { key: 'hotel', icon: '🏨', label: 'Hôtels' },
            { key: 'supermarket', icon: '🛒', label: 'Supermarchés' },
            { key: 'museum', icon: '🏗️', label: 'Musées' },
            { key: 'transit_station', icon: '🚌', label: 'Transports' },
            { key: 'bar', icon: '🍺', label: 'Bars' },
            { key: 'park', icon: '🌳', label: 'Parcs' },
            { key: 'spa', icon: '💆', label: 'Spa / Bien-être' },
          ].map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              icon={opt.icon}
              selected={selectedTypes.includes(opt.key)}
              onPress={() => togglePlaceType(opt.key)}
            />
          ))}
        </View>

        <Divider />

        {/* ── Section 3 : Planning — placeholder ──────────────────────────── */}
        <ComingSoonSection icon="📅" title="Planning" />

        <Divider />

        {/* ── Section 3 : Accès & partage — placeholder ────────────────────── */}
        <ComingSoonSection icon="👥" title="Accès & partage" />

        <Divider />

        {/* ── Section 4 : Actions ──────────────────────────────────────────── */}
        <SectionHeader icon="⚙️" title="Actions" />

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleClone}
          disabled={cloning}
          activeOpacity={0.75}
        >
          {cloning ? (
            <ActivityIndicator color={COLORS.accent} size="small" />
          ) : (
            <MaterialIcons name="content-copy" size={20} color={COLORS.accent} />
          )}
          <Text style={styles.actionBtnText}>Cloner ce roadtrip</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loader: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.title,
    fontSize: 22,
    color: COLORS.text,
  },

  // Contenu
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: FONTS.title,
    fontSize: 20,
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Label groupe
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  groupHint: {
    fontSize: 12,
    color: COLORS.textDim,
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },

  // Chips
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  chipLabelSelected: {
    color: COLORS.accent,
    fontWeight: '600',
  },

  // Label
  label: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },

  // Rayon
  radiusRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  radiusBtn: {
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  radiusBtnSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  radiusBtnText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  radiusBtnTextSelected: {
    color: COLORS.accent,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },

  // Coming soon
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    opacity: 0.45,
  },
  comingSoonText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Actions
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
