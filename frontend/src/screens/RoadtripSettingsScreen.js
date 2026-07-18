import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';
import ALL_CATEGORIES from '../constants/categories';

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

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function RoadtripSettingsScreen({ navigation, route }) {
  const { roadtripId } = route.params;
  const { bottom } = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);

  // Les keys activées par défaut
  const defaultKeys = ALL_CATEGORIES.filter((c) => c.default).map((c) => c.key);
  const [enabledKeys, setEnabledKeys] = useState(defaultKeys);
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
      if (data.enabledQuickSearch && Array.isArray(data.enabledQuickSearch)) {
        setEnabledKeys(data.enabledQuickSearch);
      }
    } catch {
      // On garde les valeurs par défaut silencieusement
    } finally {
      setLoading(false);
    }
  }, [roadtripId, token]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Header natif (identique à RoadtripDetail)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'Paramètres',
      headerTitleAlign: 'center',
      headerTitleStyle: { color: '#fff', fontSize: 18, fontWeight: '700' },
      headerStyle: { backgroundColor: 'rgba(26,26,38,1)' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  // ─── Sauvegarde ─────────────────────────────────────────────────────────────

  const save = useCallback(async (patch) => {
    const nextEnabled = patch.enabledQuickSearch;
    setEnabledKeys(nextEnabled);
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
      fetchSettings();
    } finally {
      setSaving(false);
    }
  }, [roadtripId, token, fetchSettings]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const toggleCategory = useCallback((key) => {
    const next = enabledKeys.includes(key)
      ? enabledKeys.filter((k) => k !== key)
      : [...enabledKeys, key];
    save({ enabledQuickSearch: next });
  }, [enabledKeys, save]);

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

  // ─── Supprimer ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Supprimer ce roadtrip',
      'Cette action est irréversible. Toutes les étapes, hébergements et activités seront définitivement supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error();
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            } catch {
              Alert.alert('Erreur', 'Impossible de supprimer le roadtrip.');
            }
          },
        },
      ]
    );
  }, [roadtripId, token, navigation]);

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const mainCategories = ALL_CATEGORIES.filter((c) => c.default);
  const extraCategories = ALL_CATEGORIES.filter((c) => !c.default);

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(bottom, SPACING.xl) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section : Boutons de recherche rapide ──────────────────────── */}
        <SectionHeader
          icon="🔘"
          title="Boutons de recherche rapide"
          subtitle="Activez ou désactivez les catégories affichées sous la barre de recherche sur la carte"
        />

        {/* Catégories principales */}
        <Text style={styles.groupLabel}>⭐ Principales</Text>
        <View style={styles.chipsContainer}>
          {mainCategories.map((cat) => (
            <Chip
              key={cat.key}
              label={cat.label}
              icon={cat.icon}
              selected={enabledKeys.includes(cat.key)}
              onPress={() => toggleCategory(cat.key)}
            />
          ))}
        </View>

        {/* Catégories supplémentaires */}
        <Text style={styles.groupLabel}>➕ Supplémentaires</Text>
        <Text style={styles.groupHint}>
          Activez pour ajouter un bouton dédié dans la barre de recherche
        </Text>
        <View style={styles.chipsContainer}>
          {extraCategories.map((cat) => (
            <Chip
              key={cat.key}
              label={cat.label}
              icon={cat.icon}
              selected={enabledKeys.includes(cat.key)}
              onPress={() => toggleCategory(cat.key)}
            />
          ))}
        </View>

        <Divider />

        {/* ── Section : Actions ──────────────────────────────────────────── */}
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
            <Text style={styles.actionBtnIcon}>📋</Text>
          )}
          <Text style={styles.actionBtnText}>Cloner ce roadtrip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDanger]}
          onPress={handleDelete}
          activeOpacity={0.75}
        >
          <Text style={styles.actionBtnIcon}>🗑️</Text>
          <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Supprimer ce roadtrip</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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

  // Header natif — géré par useLayoutEffect dans le composant

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
    marginBottom: SPACING.sm,
  },
  actionBtnDanger: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorDim,
  },
  actionBtnIcon: {
    fontSize: 20,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
