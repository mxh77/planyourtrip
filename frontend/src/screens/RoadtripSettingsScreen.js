import React, { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, PanResponder, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';
import ALL_CATEGORIES from '../constants/categories';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Équipements par défaut (recopie de AccommodationSection) ────────────────
const DEFAULT_AMENITY_TAGS = [
  { key: 'POOL',       label: 'Piscine',        icon: '🏊' },
  { key: 'RESTAURANT', label: 'Restaurant',     icon: '🍽️' },
  { key: 'SUPERMARKET',label: 'Supermarché / Épicerie', icon: '🛒' },
  { key: 'WIFI',       label: 'WiFi',           icon: '📶' },
  { key: 'PARKING',    label: 'Parking',        icon: '🅿️' },
  { key: 'LAUNDRY',    label: 'Laverie',        icon: '🧺' },
  { key: 'KITCHEN',    label: 'Cuisine',        icon: '🍳' },
  { key: 'BAKERY',     label: 'Boulangerie',    icon: '🥖' },
  { key: 'SHOWER',     label: 'Douche',         icon: '🚿' },
  { key: 'ELECTRICITY',label: 'Électricité',    icon: '⚡' },
  { key: 'PLAYGROUND', label: 'Terrain de jeu', icon: '🛝' },
  { key: 'DUMPSITE',   label: 'Vidange CC',     icon: '🚐' },];

/* Émoji au pif pour les icônes personnalisées qu'on ne peut pas deviner */
const FALLBACK_ICONS = ['🎪', '🎯', '🎲', '🏓', '🏸', '⛳', '🎱', '🧘', '🎨', '📚', '🎵', '🛝', '⚽', '🏀', '🎮'];

// ─── RangeSlider (double thumb) ──────────────────────────────────────────────
const SLIDER_PAD = 28;
const THUMB_SIZE = 28;
const THUMB_HALF = THUMB_SIZE / 2;

function RangeSlider({ min, max, step = 1, values, onChange }) {
  const [trackWidth, setTrackWidth] = useState(200);
  const trackRef = useRef(null);
  const valsRef = useRef(values);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const trackWRef = useRef(trackWidth);
  // Synchroniser les refs à chaque render
  valsRef.current = values;
  minRef.current = min;
  maxRef.current = max;
  trackWRef.current = trackWidth;

  const span = Math.max(1, trackWidth - THUMB_SIZE);
  const range = max - min;
  const valToPos = (v) => THUMB_HALF + ((v - min) / range) * span;
  const posToVal = (px) => {
    const s = Math.max(1, trackWRef.current - THUMB_SIZE);
    const r2 = maxRef.current - minRef.current;
    return Math.round(((px - THUMB_HALF) / s) * r2 / step) * step + minRef.current;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const leftPos = useRef(new Animated.Value(valToPos(values.min ?? min))).current;
  const rightPos = useRef(new Animated.Value(valToPos(values.max ?? max))).current;

  // Ajuster les positions quand trackWidth change (onLayout)
  const syncPositions = useCallback(() => {
    const tw = trackWRef.current;
    const s = Math.max(1, tw - THUMB_SIZE);
    const rr = maxRef.current - minRef.current;
    const vp = (v) => THUMB_HALF + ((v - minRef.current) / rr) * s;
    const l = vp(valsRef.current.min ?? minRef.current);
    const r = vp(valsRef.current.max ?? maxRef.current);
    leftPos.setValue(clamp(l, THUMB_HALF, r));
    rightPos.setValue(clamp(r, l, tw - THUMB_HALF));
  }, []);

  const handleLayout = (e) => {
    setTrackWidth(e.nativeEvent.layout.width);
    // Sync sera fait au prochain render via l'effet ci-dessous
  };

  // Sync dès que trackWidth change
  useEffect(() => { syncPositions(); }, [trackWidth, syncPositions]);

  const createPan = (isLeft) => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startX = isLeft ? leftPos.__getValue() : rightPos.__getValue();
      },
      onPanResponderMove: (_, gs) => {
        const tw = trackWRef.current;
        const v = valsRef.current;
        const lo = minRef.current;
        const hi = maxRef.current;
        const s = Math.max(1, tw - THUMB_SIZE);
        const p2v = (px) => {
          const r2 = hi - lo;
          return Math.round(((clamp(px, THUMB_HALF, tw - THUMB_HALF) - THUMB_HALF) / s) * r2 / step) * step + lo;
        };
        const v2p = (val) => THUMB_HALF + ((val - lo) / (hi - lo)) * s;

        const newVal = p2v(startX + gs.dx);
        if (isLeft) {
          const clamped = clamp(newVal, lo, v.max ?? hi);
          leftPos.setValue(v2p(clamped));
          onChange({ min: clamped, max: v.max });
        } else {
          const clamped = clamp(newVal, v.min ?? lo, hi);
          rightPos.setValue(v2p(clamped));
          onChange({ min: v.min, max: clamped });
        }
      },
      onPanResponderRelease: () => {},
    });
  };

  const leftPan = useRef(createPan(true)).current;
  const rightPan = useRef(createPan(false)).current;

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabelText}>{values.min ?? min} km</Text>
        <Text style={styles.sliderLabelText}>{values.max ?? max} km</Text>
      </View>
      <View ref={trackRef} style={styles.sliderTrack} onLayout={handleLayout}>
        <Animated.View
          style={[styles.sliderSegment, {
            left: Animated.add(leftPos, THUMB_HALF),
            width: Animated.subtract(rightPos, leftPos),
          }]}
        />
        <Animated.View
          style={[styles.sliderThumb, { left: Animated.subtract(leftPos, THUMB_HALF) }]}
          {...leftPan.panHandlers}
        >
          <View style={styles.sliderThumbInner} />
        </Animated.View>
        <Animated.View
          style={[styles.sliderThumb, { left: Animated.subtract(rightPos, THUMB_HALF) }]}
          {...rightPan.panHandlers}
        >
          <View style={styles.sliderThumbInner} />
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Composants UI ────────────────────────────────────────────────────────────

function CollapsibleSection({ icon, title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={styles.sectionIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={{ fontSize: 16, color: COLORS.textMuted }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.sectionContent}>{children}</View>}
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
  const [trailDistance, setTrailDistance] = useState({ min: '', max: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Équipements personnalisés
  const [amenityDisabled, setAmenityDisabled] = useState([]);   // clés désactivées
  const [amenityCustom, setAmenityCustom] = useState([]);       // [{ key, label, icon }]
  // Modèle IA
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  // Modal ajout équipement
  const scrollRef = useRef(null);
  const [showAddAmenity, setShowAddAmenity] = useState(false);
  const [newAmenityLabel, setNewAmenityLabel] = useState('');
  const [newAmenityIcon, setNewAmenityIcon] = useState('🎪');

  // Défiler vers le bas quand le formulaire d'ajout d'équipement apparaît
  useEffect(() => {
    if (!showAddAmenity) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo?.({ y: 99999, animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [showAddAmenity]);

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
      if (data.trailDistanceFilter) {
        setTrailDistance({
          min: data.trailDistanceFilter.min != null ? String(data.trailDistanceFilter.min) : '',
          max: data.trailDistanceFilter.max != null ? String(data.trailDistanceFilter.max) : '',
        });
      }
      if (data.customAmenityTags) {
        if (Array.isArray(data.customAmenityTags.disabled)) setAmenityDisabled(data.customAmenityTags.disabled);
        if (Array.isArray(data.customAmenityTags.custom)) setAmenityCustom(data.customAmenityTags.custom);
        if (data.customAmenityTags.aiModel) setAiModel(data.customAmenityTags.aiModel);
      }
    } catch {
      // On garde les valeurs par défaut silencieusement
    } finally {
      setLoading(false);
    }
  }, [roadtripId, token]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Header natif
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'Paramètres',
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

  const toggleAmenity = useCallback((key) => {
    const next = amenityDisabled.includes(key)
      ? amenityDisabled.filter((k) => k !== key)
      : [...amenityDisabled, key];
    setAmenityDisabled(next);
    save({
      enabledQuickSearch: enabledKeys,
      trailDistanceFilter: { min: trailDistance.min ? Number(trailDistance.min) : null, max: trailDistance.max ? Number(trailDistance.max) : null },
      customAmenityTags: { disabled: next, custom: amenityCustom },
    });
  }, [amenityDisabled, amenityCustom, enabledKeys, trailDistance, save]);

  const addCustomAmenity = useCallback(() => {
    const label = newAmenityLabel.trim();
    if (!label) { Alert.alert('Champ requis', 'Saisis le nom de l\'équipement.'); return; }
    // Générer la clé depuis le nom : "Terrain de jeu" → "PLAYGROUND"
    const key = label
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlever accents
      .replace(/[^a-zA-Z0-9\s]/g, '')                    // garder lettres/chiffres/espaces
      .trim().toUpperCase()
      .split(/\s+/).join('_');                             // espaces → _
    if (!key) { Alert.alert('Erreur', 'Impossible de générer un identifiant.'); return; }
    if (amenityCustom.some(a => a.key === key)) { Alert.alert('Déjà existant', `"${label}" existe déjà.`); return; }
    if (DEFAULT_AMENITY_TAGS.some(t => t.key === key)) { Alert.alert('Déjà existant', `"${label}" est déjà un équipement par défaut.`); return; }
    const updated = [...amenityCustom, { key, label, icon: newAmenityIcon }];
    setAmenityCustom(updated);
    setShowAddAmenity(false);
    setNewAmenityLabel('');
    setNewAmenityIcon('🎪');
    save({
      enabledQuickSearch: enabledKeys,
      trailDistanceFilter: { min: trailDistance.min ? Number(trailDistance.min) : null, max: trailDistance.max ? Number(trailDistance.max) : null },
      customAmenityTags: { disabled: amenityDisabled, custom: updated },
    });
  }, [newAmenityLabel, newAmenityIcon, amenityCustom, amenityDisabled, enabledKeys, trailDistance, save]);

  const removeCustomAmenity = useCallback((key) => {
    const updated = amenityCustom.filter(a => a.key !== key);
    setAmenityCustom(updated);
    save({
      enabledQuickSearch: enabledKeys,
      trailDistanceFilter: { min: trailDistance.min ? Number(trailDistance.min) : null, max: trailDistance.max ? Number(trailDistance.max) : null },
      customAmenityTags: { disabled: amenityDisabled, custom: updated },
    });
  }, [amenityCustom, amenityDisabled, enabledKeys, trailDistance, save]);

  const toggleCategory = useCallback((key) => {
    const next = enabledKeys.includes(key)
      ? enabledKeys.filter((k) => k !== key)
      : [...enabledKeys, key];
    save({ enabledQuickSearch: next, trailDistanceFilter: { min: trailDistance.min ? Number(trailDistance.min) : null, max: trailDistance.max ? Number(trailDistance.max) : null } });
  }, [enabledKeys, trailDistance, save]);

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
      '⚠️ Cette action est irréversible et réservée au propriétaire.\n\nToutes les étapes, hébergements et activités seront définitivement supprimés.',
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
              if (!res.ok) {
                let msg = 'Impossible de supprimer le roadtrip.';
                try {
                  const body = await res.json();
                  if (body.error === 'Role OWNER required' || body.error === 'Access denied') {
                    msg = 'Seul le propriétaire du roadtrip peut le supprimer.';
                  } else if (body.error) {
                    msg = body.error;
                  }
                } catch {}
                throw new Error(msg);
              }
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            } catch (e) {
              Alert.alert('Suppression impossible', e.message || 'Impossible de supprimer le roadtrip.');
            }
          },
        },
      ]
    );
  }, [roadtripId, token, navigation]);

  // ─── Export ──────────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    Alert.alert(
      'Exporter ce roadtrip',
      'Une sauvegarde complète au format JSON sera créée sur le serveur (fichier horodaté).',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exporter',
          onPress: async () => {
            setExporting(true);
            try {
              const res = await fetch(`${API_URL}/api/export/${roadtripId}/save`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error();
              const data = await res.json();
              Alert.alert(
                '✅ Export réussi',
                `Fichier créé :\n${data.filename}\n\n${(data.fileSize / 1024).toFixed(1)} Ko`
              );
            } catch {
              Alert.alert('Erreur', 'Impossible d\'exporter le roadtrip.');
            } finally {
              setExporting(false);
            }
          },
        },
      ]
    );
  }, [roadtripId, token]);

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(bottom, SPACING.xl) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(w, h) => {
          if (showAddAmenity) {
            scrollRef.current?.scrollTo?.({ y: h, animated: true });
          }
        }}
      >
        {/* ── Section : Boutons de recherche rapide ──────────────────────── */}
        <CollapsibleSection
          icon="🔘"
          title="Boutons de recherche rapide"
          subtitle="Activez ou désactivez les catégories affichées sous la barre de recherche sur la carte"
        >
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
        </CollapsibleSection>

        <Divider />

        {/* ── Section : Filtre distance randonnées ──────────────────────── */}
        <CollapsibleSection
          icon="🥾"
          title="Filtre distance randonnées"
          subtitle="Limitez les résultats de randonnées à une tranche de distance"
        >
          <RangeSlider
            min={0}
            max={50}
            step={1}
            values={{
              min: trailDistance.min ? Number(trailDistance.min) : 0,
              max: trailDistance.max ? Number(trailDistance.max) : 50,
            }}
            onChange={(v) => {
              setTrailDistance({ min: String(v.min), max: String(v.max) });
              save({
                enabledQuickSearch: enabledKeys,
                trailDistanceFilter: { min: v.min, max: v.max },
              });
            }}
          />
        </CollapsibleSection>

        <Divider />

        {/* ── Section : Modèle IA ───────────────────────────────────────── */}
        <CollapsibleSection
          icon="🧠"
          title="Modèle IA"
          subtitle="Choisis le modèle utilisé par le bouton ✨ Analyser"
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['gpt-4o-mini', 'deepseek-v4-flash'].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, aiModel === m && styles.chipSelected]}
                onPress={() => {
                  setAiModel(m);
                  save({
                    enabledQuickSearch: enabledKeys,
                    trailDistanceFilter: { min: trailDistance.min ? Number(trailDistance.min) : null, max: trailDistance.max ? Number(trailDistance.max) : null },
                    customAmenityTags: { disabled: amenityDisabled, custom: amenityCustom, aiModel: m },
                  });
                }}
              >
                <Text style={[styles.chipLabel, aiModel === m && styles.chipLabelSelected]}>
                  {m === 'gpt-4o-mini' ? 'OpenAI GPT-4o mini' : 'DeepSeek V4 Flash'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </CollapsibleSection>

        <Divider />

        {/* ── Section : Équipements personnalisés ───────────────────────── */}
        <CollapsibleSection
          icon="🏕️"
          title="Équipements personnalisés"
          subtitle="Désactive les équipements qui ne t'intéressent pas et ajoute tes propres catégories"
        >
          <Text style={styles.groupLabel}>⚙️ Par défaut</Text>
          <Text style={styles.groupHint}>Appuie pour désactiver un équipement</Text>
          <View style={styles.chipsContainer}>
            {DEFAULT_AMENITY_TAGS.map((tag) => {
              const disabled = amenityDisabled.includes(tag.key);
              return (
                <TouchableOpacity
                  key={tag.key}
                  style={[styles.chip, disabled && styles.chipInactive]}
                  onPress={() => toggleAmenity(tag.key)}
                >
                  <Text style={{ fontSize: 13, opacity: disabled ? 0.4 : 1 }}>{tag.icon}</Text>
                  <Text style={[styles.chipLabel, disabled && { color: COLORS.textDim, textDecorationLine: 'line-through' }]}>
                    {tag.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.groupLabel}>➕ Personnalisés</Text>
          {amenityCustom.length === 0 ? (
            <Text style={styles.groupHint}>Aucun équipement personnalisé pour le moment.</Text>
          ) : (
            <View style={styles.chipsContainer}>
              {amenityCustom.map((tag) => (
                <View key={tag.key} style={[styles.chip, { backgroundColor: 'rgba(232,164,53,0.15)', borderColor: 'rgba(232,164,53,0.3)' }]}>
                  <Text style={{ fontSize: 13 }}>{tag.icon || '🏷️'}</Text>
                  <Text style={[styles.chipLabel, { color: COLORS.accent }]}>{tag.label}</Text>
                  <TouchableOpacity onPress={() => removeCustomAmenity(tag.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 14, color: COLORS.error, marginLeft: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.addCustomBtn}
            onPress={() => setShowAddAmenity(true)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16, color: COLORS.accent }}>+</Text>
            <Text style={styles.addCustomBtnText}>Ajouter un équipement</Text>
          </TouchableOpacity>

          {showAddAmenity && (
            <View style={styles.addModal}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 }}>Nouvel équipement</Text>
              <TextInput
                style={styles.addInput}
                value={newAmenityLabel}
                onChangeText={setNewAmenityLabel}
                placeholder="Nom (ex: Terrain de jeu)"
                placeholderTextColor={COLORS.textDim}
                autoFocus
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {FALLBACK_ICONS.map((ic) => (
                  <TouchableOpacity
                    key={ic}
                    onPress={() => setNewAmenityIcon(ic)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: newAmenityIcon === ic ? 'rgba(232,164,53,0.2)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)' }]} onPress={() => setShowAddAmenity(false)}>
                  <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.accent }]} onPress={addCustomAmenity}>
                  <Text style={{ color: COLORS.bg, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </CollapsibleSection>

        <Divider />

        {/* ── Section : Actions ──────────────────────────────────────────── */}
        <CollapsibleSection icon="⚙️" title="Actions">
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
            style={styles.actionBtn}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.75}
          >
            {exporting ? (
              <ActivityIndicator color={COLORS.accent} size="small" />
            ) : (
              <Text style={styles.actionBtnIcon}>💾</Text>
            )}
            <Text style={styles.actionBtnText}>Exporter en JSON (serveur)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={handleDelete}
            activeOpacity={0.75}
          >
            <Text style={styles.actionBtnIcon}>🗑️</Text>
            <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Supprimer ce roadtrip</Text>
          </TouchableOpacity>
        </CollapsibleSection>
      </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sectionContent: {
    paddingTop: SPACING.sm,
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

  // ─── RangeSlider ──────────────────────────────────────────────────────────
  sliderContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sliderLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
    marginHorizontal: THUMB_HALF,
  },
  sliderSegment: {
    position: 'absolute',
    height: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 3,
    top: 0,
  },
  sliderThumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#1a1a26',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  sliderThumbInner: {
    width: THUMB_SIZE - 8,
    height: THUMB_SIZE - 8,
    borderRadius: (THUMB_SIZE - 8) / 2,
    backgroundColor: COLORS.accent,
  },

  // ─── Équipements personnalisés ──────────────────────────────────────────
  chipInactive: {
    opacity: 0.5,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  addCustomBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.accent,
    marginBottom: SPACING.sm,
  },
  addCustomBtnText: {
    fontSize: 14, fontWeight: '600', color: COLORS.accent,
  },
  addModal: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  addInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 14,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8,
  },
});
