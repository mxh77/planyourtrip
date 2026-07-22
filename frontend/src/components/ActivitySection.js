import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal,
  ScrollView, Alert, StyleSheet, Pressable, Keyboard, Platform,
  Image, ActivityIndicator, Linking, FlatList,
} from 'react-native';
import { useQuery } from '@powersync/react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';
import LocationPicker from './LocationPicker';
import DateTimePickerModal from './DateTimePickerModal';
import {
  localCreateActivity,
  localUpdateActivity,
  localDeleteActivity,
} from '../powersync/localWrite';
import { validateActivityDates } from '../utils/dateValidation';
import DocumentSection from './DocumentSection';

// ─── Helpers date/heure ──────────────────────────────────────────────────────
function parseDtString(str) {
  if (!str) return { date: new Date(), time: null };
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) {
    return {
      date: new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 12, 0, 0),
      time: `${m[4]}:${m[5]}`,
    };
  }
  return { date: new Date(), time: null };
}

function formatDtString(date, time) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return time ? `${y}-${mo}-${d} ${time}` : `${y}-${mo}-${d}`;
}

function displayDt(str) {
  if (!str) return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return str;
  const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 12, 0, 0);
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return m[4] ? `${dateStr}  ·  ${m[4]}:${m[5]}` : dateStr;
}

const ACT_DEF_RADIUS = 1000;
const LODGING_TYPES_A = ['hotel', 'motel', 'campground', 'rv_park', 'bed_and_breakfast', 'hostel'];
const ACTIVITY_NEARBY = ['restaurant', 'cafe', 'museum', 'park', 'cultural_center', 'supermarket', 'grocery_store', 'hiking_area', 'transit_station'];
const LEGACY_ACT = { tourist_attraction: 'cultural_center', shopping_mall: 'department_store', shopping_center: 'department_store' };

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

async function fetchNearbyActivities(lat, lng, types, radius) {
  if (!types || types.length === 0) return [];
  try {
    const token = useAuthStore.getState().token;
    const resp = await fetch(`${API_URL}/api/places/searchNearby`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat,
        lng,
        radius,
        includedTypes: types,
        maxResultCount: 8,
        languageCode: 'fr'
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
    return data.places ?? [];
  } catch (err) {
    console.error('[fetchNearbyActivities] Erreur:', err.message);
    return [];
  }
}

async function searchActivitiesByText(query, lat, lng, radius) {
  if (!query.trim()) return [];
  try {
    const token = useAuthStore.getState().token;
    const body = {
      textQuery: query,
      languageCode: 'fr',
      maxResultCount: 20,
    };
    if (lat && lng) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radius ?? 50000
        }
      };
    }
    const resp = await fetch(`${API_URL}/api/places/searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message ?? `HTTP ${resp.status}`);
    const places = data.places ?? [];
    
    // Filtre client-side
    if (lat && lng) {
      const maxKm = (radius ?? 50000) / 1000;
      return places.filter(p =>
        p.location?.latitude == null || calcDistance(lat, lng, p.location.latitude, p.location.longitude) <= maxKm
      );
    }
    return places;
  } catch (err) {
    console.error('[searchActivitiesByText] Erreur:', err.message);
    return [];
  }
}

const ACTIVITY_TYPES = [
  { key: 'ACTIVITY', label: 'Activité', icon: '🎯' },
  { key: 'RESTAURANT', label: 'Restaurant', icon: '🍽️' },
  { key: 'TRANSPORT', label: 'Transport', icon: '🚌' },
  { key: 'SUPERMARKET', label: 'Supermarché', icon: '🛒' },
  { key: 'HIKING', label: 'Randonnée', icon: '🥾' },
  { key: 'OTHER', label: 'Autre', icon: '📌' },
];

// ─── Conversion de devises ──────────────────────────────────────────────────
let cachedRates = null;
async function getRate(from, to) {
  if (from === to) return 1;
  try {
    if (!cachedRates) {
      const resp = await fetch('https://api.frankfurter.app/latest?from=EUR');
      const json = await resp.json();
      cachedRates = json.rates;
    }
    if (from === 'EUR') return cachedRates[to] ?? 1;
    if (to === 'EUR') return 1 / (cachedRates[from] ?? 1);
    return (cachedRates[to] ?? 1) / (cachedRates[from] ?? 1);
  } catch {
    return 1;
  }
}

async function convertValue(val, from, to) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return val;
  const rate = await getRate(from, to);
  return (n * rate).toFixed(2);
}

// ─── Format 2 décimales ─────────────────────────────────────────────────────
function fmtPrice(val) {
  if (!val) return '';
  const n = parseFloat(val.toString().replace(',', '.'));
  if (isNaN(n)) return val;
  return n.toFixed(2);
}

const EMPTY_FORM = {
  type: 'ACTIVITY',
  name: '',
  location: '',
  latitude: null,
  longitude: null,
  parkingAddress: '',
  parkingLatitude: null,
  parkingLongitude: null,
  startTime: '',
  endTime: '',
  bookingRef: '',
  cost: '',
  depositPaid: '',
  currency: 'EUR',
  notes: '',
};

export default function ActivitySection({ stepId, roadtripId, userId, latitude, longitude, allowedTypes, radius, stepStartDate, stepEndDate, stepArrivalTime, stepDepartureTime, initialEditId }) {
  const { data: activities } = useQuery(
    stepId
      ? 'SELECT * FROM activities WHERE stepId = ? ORDER BY startTime ASC'
      : 'SELECT * FROM activities WHERE 1=0',
    stepId ? [stepId] : []
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('manual');
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Ouverture automatique d'un item en édition
  useEffect(() => {
    if (initialEditId && activities?.length > 0) {
      const item = activities.find(a => a.id === initialEditId);
      if (item) openEdit(item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId, activities?.length]);
  const [parkingSuggestions, setParkingSuggestions] = useState([]);
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingShowDropdown, setParkingShowDropdown] = useState(false);
  const parkingTimeoutRef = useRef(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [dtPickerVisible, setDtPickerVisible] = useState(false);
  const [dtPickerTarget, setDtPickerTarget] = useState(null); // 'start' | 'end'

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const hasCoords = !!(latitude && longitude);

  useEffect(() => {
    if (tab !== 'nearby' || !modalVisible || !hasCoords) return;
    setNearbyLoading(true);
    setNearbyError(null);
    // Intersection des types settings avec le domaine activités, fallback sur tous les types activité
    const fromSettings = allowedTypes && allowedTypes.length > 0
      ? allowedTypes.map(t => LEGACY_ACT[t] ?? t).filter(t => !LODGING_TYPES_A.includes(t))
      : [];
    const types = fromSettings.length > 0 ? fromSettings : ACTIVITY_NEARBY;
    const effectiveRadius = radius ?? ACT_DEF_RADIUS;
    fetchNearbyActivities(latitude, longitude, types, effectiveRadius)
      .then(p => setNearbyPlaces(p))
      .catch(e => setNearbyError(e.message ?? 'Erreur réseau'))
      .finally(() => setNearbyLoading(false));
  }, [tab, modalVisible]);

  useEffect(() => {
    if (tab !== 'search' || !modalVisible) return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      searchActivitiesByText(searchQuery, latitude, longitude, radius ?? ACT_DEF_RADIUS)
        .then(r => setSearchResults(r))
        .catch(e => setSearchError(e.message ?? 'Erreur réseau'))
        .finally(() => setSearchLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, tab, modalVisible]);

  const openCreate = () => {
    // Pré-remplir avec la date/heure d'arrivée de l'étape (même pour la fin)
    // Si l'étape n'a pas d'heure, forcer 10:00
    const defaultTime = stepArrivalTime || '10:00';
    const defaultStart = stepStartDate
      ? `${stepStartDate} ${defaultTime}`
      : '';
    const defaultEnd = stepEndDate
      ? `${stepEndDate} ${defaultTime}`
      : '';
    setForm({
      ...EMPTY_FORM,
      startTime: defaultStart,
      endTime: defaultEnd,
    });
    setEditingId(null);
    setTab('manual');
    setNearbyPlaces([]);
    setSearchQuery('');
    setSearchResults([]);
    setModalVisible(true);
  };

  const openEdit = (a) => {
    setForm({
      type: a.type ?? 'ACTIVITY',
      name: a.name ?? '',
      location: a.location ?? '',
      latitude: a.latitude ?? null,
      longitude: a.longitude ?? null,
      parkingAddress: a.parkingAddress ?? '',
      parkingLatitude: a.parkingLatitude ?? null,
      parkingLongitude: a.parkingLongitude ?? null,
      startTime: a.startTime || stepStartDate || '',
      endTime: a.endTime || stepEndDate || '',
      bookingRef: a.bookingRef ?? '',
      cost: a.cost != null ? a.cost.toFixed(2) : '',
      depositPaid: a.depositPaid != null ? a.depositPaid.toFixed(2) : '',
      currency: a.currency ?? 'EUR',
      notes: a.notes ?? '',
    });
    setEditingId(a.id);
    setTab('manual');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Champ requis', 'Le nom est obligatoire.');
      return;
    }
    const dateErrors = validateActivityDates({
      startTime: form.startTime.trim() || undefined,
      endTime: form.endTime.trim() || undefined,
      stepStart: stepStartDate,
      stepEnd: stepEndDate,
    });
    if (dateErrors.length > 0) {
      Alert.alert('Dates incohérentes', dateErrors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const data = {
        type: form.type,
        name: form.name.trim(),
        location: form.location.trim() || null,
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        parkingAddress: form.parkingAddress.trim() || null,
        parkingLatitude: form.parkingLatitude ?? null,
        parkingLongitude: form.parkingLongitude ?? null,
        startTime: form.startTime.trim() || null,
        endTime: form.endTime.trim() || null,
        bookingRef: form.bookingRef.trim() || null,
        cost: form.cost ? parseFloat(form.cost.replace(',', '.')) : null,
        depositPaid: form.depositPaid ? parseFloat(form.depositPaid.replace(',', '.')) : null,
        currency: form.currency || 'EUR',
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        await localUpdateActivity(editingId, data);
      } else {
        await localCreateActivity(
          { ...data, stepId, roadtripId, order: (activities?.length ?? 0) },
          userId
        );
      }
      setModalVisible(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (activity) => {
    Alert.alert(`Supprimer « ${activity.name} » ?`, null, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => localDeleteActivity(activity.id),
      },
    ]);
  };

  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>🎯 Activités</Text>
        <TouchableOpacity onPress={openCreate} style={styles.addIconBtn}>
          <MaterialIcons name="add" size={18} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {activities && activities.length > 0 ? (
        <View style={styles.list}>
          {activities.map((activity) => {
            const typeConfig =
              ACTIVITY_TYPES.find((t) => t.key === activity.type) ?? ACTIVITY_TYPES[3];
            const hasTime = activity.startTime || activity.endTime;
            return (
              <View key={activity.id}>
                <TouchableOpacity style={styles.row} onPress={() => openEdit(activity)} activeOpacity={0.75}>
                  <View style={styles.rowIconWrap}>
                    <Text style={styles.rowIcon}>{typeConfig.icon}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {activity.name}
                    </Text>
                    {hasTime ? (
                      <Text style={styles.rowSub}>
                        {displayDt(activity.startTime) ?? ''}
                        {activity.startTime && activity.endTime ? ' → ' : ''}
                        {displayDt(activity.endTime) ?? ''}
                      </Text>
                    ) : null}
                    {activity.location && activity.location !== activity.name ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        📍 {activity.location}
                      </Text>
                    ) : null}
                    {activity.parkingAddress ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        🅿️ {activity.parkingAddress}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(activity)}
                    style={styles.actionBtn}
                  >
                    <MaterialIcons name="delete-outline" size={16} color={COLORS.error} />
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Documents rattachés à cette activité */}
                <DocumentSection activityId={activity.id} roadtripId={roadtripId} />
              </View>
            );
          })}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptyBtn} onPress={openCreate}>
          <MaterialIcons name="add" size={16} color={COLORS.accent} />
          <Text style={styles.emptyBtnText}>Ajouter une activité</Text>
        </TouchableOpacity>
      )}

      <DateTimePickerModal
        visible={dtPickerVisible}
        date={dtPickerTarget === 'start' ? parseDtString(form.startTime).date : parseDtString(form.endTime).date}
        time={dtPickerTarget === 'start' ? parseDtString(form.startTime).time : parseDtString(form.endTime).time}
        label={dtPickerTarget === 'start' ? 'Date et heure de début' : 'Date et heure de fin'}
        minDate={dtPickerTarget === 'end' ? parseDtString(form.startTime).date : null}
        onConfirm={({ date, time }) => {
          const str = formatDtString(date, time ?? '00:00');
          if (dtPickerTarget === 'start') {
            setForm((f) => ({ ...f, startTime: str }));
          } else {
            setForm((f) => ({ ...f, endTime: str }));
          }
          setDtPickerVisible(false);
        }}
        onCancel={() => setDtPickerVisible(false)}
      />

      {/* ─── Modal formulaire ─────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setDtPickerVisible(false); setModalVisible(false); }}
      >
        <View style={{ flex: 1 }}>
        <Pressable style={[styles.overlay, { paddingBottom: keyboardHeight }]} onPress={() => { setDtPickerVisible(false); setModalVisible(false); }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {editingId ? 'Modifier' : 'Ajouter'} une activité
            </Text>

            {hasCoords && !editingId && (
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabBtn, tab === 'manual' && styles.tabBtnActive]}
                  onPress={() => setTab('manual')}
                >
                  <Text style={[styles.tabBtnText, tab === 'manual' && styles.tabBtnTextActive]}>✏️ Manuel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, tab === 'nearby' && styles.tabBtnActive]}
                  onPress={() => setTab('nearby')}
                >
                  <Text style={[styles.tabBtnText, tab === 'nearby' && styles.tabBtnTextActive]}>📍 À proximité</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, tab === 'search' && styles.tabBtnActive]}
                  onPress={() => setTab('search')}
                >
                  <Text style={[styles.tabBtnText, tab === 'search' && styles.tabBtnTextActive]}>🔍 Chercher</Text>
                </TouchableOpacity>
              </View>
            )}

            {tab === 'search' ? (
              <View style={{ marginTop: SPACING.sm }}>
                <View style={styles.searchInputRow}>
                  <MaterialIcons name="search" size={18} color={COLORS.textDim} style={{ marginRight: SPACING.xs }} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Musée, restaurant, parc…"
                    placeholderTextColor={COLORS.textDim}
                    autoFocus
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                      <MaterialIcons name="close" size={16} color={COLORS.textDim} />
                    </TouchableOpacity>
                  )}
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                  {searchLoading ? (
                    <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.lg }} />
                  ) : searchError ? (
                    <Text style={styles.nearbyMsg}>{searchError}</Text>
                  ) : searchQuery.trim() && searchResults.length === 0 ? (
                    <Text style={styles.nearbyMsg}>Aucun résultat pour « {searchQuery} ».</Text>
                  ) : !searchQuery.trim() ? (
                    <Text style={styles.nearbyMsg}>Saisissez le nom d’un lieu pour le rechercher.</Text>
                  ) : (
                    [...searchResults]
                      .sort((a, b) => {
                        if (!latitude || !longitude) return 0;
                        const da = a.location?.latitude != null ? calcDistance(latitude, longitude, a.location.latitude, a.location.longitude) : Infinity;
                        const db = b.location?.latitude != null ? calcDistance(latitude, longitude, b.location.latitude, b.location.longitude) : Infinity;
                        return da - db;
                      })
                      .map((place) => {
                        const pName = place.photos?.[0]?.name;
                        const pUri = pName ? `https://places.googleapis.com/v1/${pName}/media?maxWidthPx=200&key=${API_KEY}` : null;
                        return (
                          <TouchableOpacity
                            key={place.id}
                            style={styles.nearbyCard}
                            onPress={() => {
                              setForm((f) => ({
                                ...f,
                                name: place.displayName?.text ?? '',
                                location: place.formattedAddress ?? '',
                                latitude: place.location?.latitude ?? null,
                                longitude: place.location?.longitude ?? null,
                              }));
                              setTab('manual');
                            }}
                            activeOpacity={0.75}
                          >
                            {pUri ? (
                              <Image source={{ uri: pUri }} style={styles.nearbyCardPhoto} resizeMode="cover" />
                            ) : (
                              <View style={[styles.nearbyCardPhoto, styles.nearbyCardNoPhoto]}>
                                <Text style={{ fontSize: 22 }}>📍</Text>
                              </View>
                            )}
                            <View style={styles.nearbyCardBody}>
                              <Text style={styles.nearbyCardName} numberOfLines={1}>{place.displayName?.text ?? '—'}</Text>
                              {!!place.formattedAddress && <Text style={styles.nearbyCardAddr} numberOfLines={2}>{place.formattedAddress}</Text>}
                              <View style={styles.nearbyCardMeta}>
                                {place.rating != null && <Text style={styles.nearbyCardRating}>⭐ {place.rating}</Text>}
                                {latitude && longitude && place.location?.latitude != null && (
                                  <Text style={styles.nearbyCardDist}>📍 {fmtDistance(calcDistance(latitude, longitude, place.location.latitude, place.location.longitude))}</Text>
                                )}
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query_place_id=${place.id}&query=${encodeURIComponent(place.displayName?.text ?? '')}`)}
                              style={styles.nearbyCardMapsBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="open-in-new" size={18} color={COLORS.accent} />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        );
                      })
                  )}
                </ScrollView>
              </View>
            ) : tab === 'nearby' ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginTop: SPACING.sm }}>
                {nearbyLoading ? (
                  <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.lg }} />
                ) : nearbyError ? (
                  <Text style={styles.nearbyMsg}>{nearbyError}</Text>
                ) : nearbyPlaces.length === 0 ? (
                  <Text style={styles.nearbyMsg}>Aucun lieu trouvé à proximité.</Text>
                ) : (
                  [...nearbyPlaces]
                    .sort((a, b) => {
                      if (!latitude || !longitude) return 0;
                      const da = a.location?.latitude != null ? calcDistance(latitude, longitude, a.location.latitude, a.location.longitude) : Infinity;
                      const db = b.location?.latitude != null ? calcDistance(latitude, longitude, b.location.latitude, b.location.longitude) : Infinity;
                      return da - db;
                    })
                    .map((place) => {
                    const pName = place.photos?.[0]?.name;
                    const pUri = pName ? `https://places.googleapis.com/v1/${pName}/media?maxWidthPx=200&key=${API_KEY}` : null;
                    return (
                      <TouchableOpacity
                        key={place.id}
                        style={styles.nearbyCard}
                        onPress={() => {
                          setForm((f) => ({
                            ...f,
                            name: place.displayName?.text ?? '',
                            location: place.formattedAddress ?? '',
                            latitude: place.location?.latitude ?? null,
                            longitude: place.location?.longitude ?? null,
                          }));
                          setTab('manual');
                        }}
                        activeOpacity={0.75}
                      >
                        {pUri ? (
                          <Image source={{ uri: pUri }} style={styles.nearbyCardPhoto} resizeMode="cover" />
                        ) : (
                          <View style={[styles.nearbyCardPhoto, styles.nearbyCardNoPhoto]}>
                            <Text style={{ fontSize: 22 }}>📍</Text>
                          </View>
                        )}
                        <View style={styles.nearbyCardBody}>
                          <Text style={styles.nearbyCardName} numberOfLines={1}>{place.displayName?.text ?? '—'}</Text>
                          {!!place.formattedAddress && <Text style={styles.nearbyCardAddr} numberOfLines={2}>{place.formattedAddress}</Text>}
                          <View style={styles.nearbyCardMeta}>
                            {place.rating != null && <Text style={styles.nearbyCardRating}>⭐ {place.rating}</Text>}
                            {latitude && longitude && place.location?.latitude != null && (
                              <Text style={styles.nearbyCardDist}>📍 {fmtDistance(calcDistance(latitude, longitude, place.location.latitude, place.location.longitude))}</Text>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query_place_id=${place.id}&query=${encodeURIComponent(place.displayName?.text ?? '')}`)}
                          style={styles.nearbyCardMapsBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="open-in-new" size={18} color={COLORS.accent} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            ) : (
            <>
            {/* Nom — hors ScrollView */}
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Visite du Louvre…"
              placeholderTextColor={COLORS.textDim}
            />

            {/* Lieu — hors ScrollView pour éviter FlatList imbriquée */}
            <LocationPicker
              label="Lieu"
              initialValue={form.location}
              onSelect={({ location, latitude, longitude }) => setForm((f) => ({ ...f, location, latitude: latitude ?? null, longitude: longitude ?? null }))}
            />

            {/* Parking (facultatif) avec autocomplétion */}
            <View style={{ marginBottom: SPACING.md, zIndex: 50 }}>
              <Text style={styles.label}>Parking (facultatif)</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[styles.input, { paddingRight: 44 }]}
                  value={form.parkingAddress}
                  onChangeText={(text) => {
                    setForm((f) => ({ ...f, parkingAddress: text }));
                    if (parkingTimeoutRef.current) clearTimeout(parkingTimeoutRef.current);
                    if (!text || text.length < 2) { setParkingSuggestions([]); return; }
                    parkingTimeoutRef.current = setTimeout(async () => {
                      setParkingLoading(true);
                      try {
                        const token = useAuthStore.getState().token;
                        const res = await fetch(`${API_URL}/api/places/autocomplete?input=${encodeURIComponent(text)}&language=fr`, {
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        const data = await res.json();
                        const raw = Array.isArray(data) ? data : data.predictions || [];
                        setParkingSuggestions(raw.map(p => ({
                          placeId: p.place_id || p.placeId,
                          description: p.description || p.mainText || '',
                          mainText: p.main_text || '',
                        })));
                        setParkingShowDropdown(true);
                      } catch { setParkingSuggestions([]); }
                      finally { setParkingLoading(false); }
                    }, 300);
                  }}
                  placeholder="Adresse du parking…"
                  placeholderTextColor={COLORS.textDim}
                />
                {parkingLoading && (
                  <ActivityIndicator size="small" color={COLORS.accent} style={{ position: 'absolute', right: 12, top: 0, bottom: 0 }} />
                )}
                {form.parkingAddress && !parkingLoading ? (
                  <TouchableOpacity
                    onPress={() => { setForm((f) => ({ ...f, parkingAddress: '' })); setParkingSuggestions([]); }}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      width: 44, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: COLORS.textDim, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {parkingShowDropdown && parkingSuggestions.length > 0 && (
                <View style={{
                  backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.md,
                  borderWidth: 1, borderColor: COLORS.border, marginTop: 4,
                  maxHeight: 200, overflow: 'hidden',
                }}>
                  <FlatList
                    data={parkingSuggestions}
                    keyExtractor={(item, i) => `${item.placeId || i}`}
                    scrollEnabled={parkingSuggestions.length > 4}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={{ paddingVertical: 12, paddingHorizontal: SPACING.md }}
                        onPress={async () => {
                          const addr = item.description || item.mainText || '';
                          let lat = null, lng = null;
                          if (item.placeId) {
                            try {
                              const token = useAuthStore.getState().token;
                              const res = await fetch(`${API_URL}/api/places/${encodeURIComponent(item.placeId)}?language=fr`, {
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              const data = await res.json();
                              lat = data.lat ?? null;
                              lng = data.lng ?? null;
                            } catch {}
                          }
                          setForm((f) => ({ ...f, parkingAddress: addr, parkingLatitude: lat, parkingLongitude: lng }));
                          setParkingShowDropdown(false);
                          setParkingSuggestions([]);
                          Keyboard.dismiss();
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                          {item.mainText || item.description}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >

              {/* Type */}
              <Text style={styles.label}>Type</Text>
              <View style={styles.chipRow}>
                {ACTIVITY_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.chip, form.type === t.key && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, type: t.key }))}
                  >
                    <Text style={styles.chipIcon}>{t.icon}</Text>
                    <Text
                      style={[styles.chipLabel, form.type === t.key && styles.chipLabelActive]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Horaires */}
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Début</Text>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => { setDtPickerTarget('start'); setDtPickerVisible(true); }}
                  >
                    <Text style={form.startTime ? styles.dateBtnText : styles.dateBtnPlaceholder}>
                      {displayDt(form.startTime) || 'Date & heure'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={16} color={COLORS.textDim} />
                  </TouchableOpacity>
                </View>
                <View style={{ width: SPACING.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Fin</Text>
                  <TouchableOpacity
                    style={styles.dateBtn}
                    onPress={() => { setDtPickerTarget('end'); setDtPickerVisible(true); }}
                  >
                    <Text style={form.endTime ? styles.dateBtnText : styles.dateBtnPlaceholder}>
                      {displayDt(form.endTime) || 'Date & heure'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={16} color={COLORS.textDim} />
                  </TouchableOpacity>
                </View>
              </View>

                    {/* Devise */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Devise</Text>
                      {['EUR', 'CHF'].map((c) => (
                        <TouchableOpacity key={c}
                          onPress={async () => {
                            if (form.currency === c) return;
                            const oldCur = form.currency;
                            setForm((f) => ({ ...f, currency: c }));
                            const convertFields = ['cost', 'depositPaid'];
                            for (const field of convertFields) {
                              const val = form[field];
                              if (val && parseFloat(val.replace(',', '.'))) {
                                const converted = await convertValue(val.replace(',', '.'), oldCur, c);
                                setForm((prev) => ({ ...prev, [field]: converted }));
                              }
                            }
                          }}
                          style={{
                            paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8,
                            backgroundColor: form.currency === c ? 'rgba(232,164,53,0.2)' : 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: form.currency === c ? 'rgba(232,164,53,0.4)' : 'rgba(255,255,255,0.06)',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: form.currency === c ? '#E8A435' : 'rgba(255,255,255,0.5)' }}>{c === 'EUR' ? 'EUR' : 'CHF'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Total</Text>
                        <TextInput
                          style={styles.input}
                          value={form.cost}
                          onChangeText={(v) => setForm((f) => ({ ...f, cost: v.replace(',', '.') }))}
                          onBlur={() => setForm((f) => ({ ...f, cost: fmtPrice(f.cost) }))}
                          keyboardType="decimal-pad"
                          placeholder={`ex: 35 ${form.currency === 'CHF' ? 'CHF' : '€'}`}
                          placeholderTextColor={COLORS.textDim}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Acompte</Text>
                        <TextInput
                          style={[styles.input, { borderColor: 'rgba(34,197,94,0.3)' }]}
                          value={form.depositPaid}
                          onChangeText={(v) => setForm((f) => ({ ...f, depositPaid: v.replace(',', '.') }))}
                          onBlur={() => setForm((f) => ({ ...f, depositPaid: fmtPrice(f.depositPaid) }))}
                          keyboardType="decimal-pad"
                          placeholder={`ex: 15 ${form.currency === 'CHF' ? 'CHF' : '€'}`}
                          placeholderTextColor={COLORS.textDim}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Solde</Text>
                        <View style={[styles.input, { borderColor: 'rgba(232,84,53,0.3)', justifyContent: 'center', paddingVertical: 12 }]}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: form.cost && parseFloat(form.cost.replace(',', '.')) > parseFloat((form.depositPaid || '0').replace(',', '.')) ? '#ef4444' : '#4ade80' }}>
                            {form.cost
                              ? `${Math.max(0, parseFloat(form.cost.replace(',', '.')) - parseFloat((form.depositPaid || '0').replace(',', '.'))).toFixed(2)} ${form.currency === 'CHF' ? 'CHF' : '€'}`
                              : '—'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Référence réservation */}
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Référence réservation</Text>
                      <TextInput
                        style={styles.input}
                        value={form.bookingRef}
                        onChangeText={(v) => setForm((f) => ({ ...f, bookingRef: v }))}
                        placeholder="Ex: ABC123XYZ"
                        placeholderTextColor={COLORS.textDim}
                      />
                    </View>

              {/* Notes */}
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Infos pratiques, réservation…"
                placeholderTextColor={COLORS.textDim}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            </>
            )}
          </Pressable>
        </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  addIconBtn: { padding: SPACING.xs },
  list: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: { fontSize: 16 },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: COLORS.textMuted, fontSize: 12 },
  actionBtn: { padding: SPACING.xs },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  emptyBtnText: { color: COLORS.accent, fontSize: 14, fontWeight: '600' },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateBtnText: { color: COLORS.text, fontSize: 15, flex: 1 },
  dateBtnPlaceholder: { color: COLORS.textDim, fontSize: 15, flex: 1 },
  timeRow: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  chipIcon: { fontSize: 14 },
  chipLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  chipLabelActive: { color: COLORS.accent },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: COLORS.bg, fontSize: 15, fontWeight: '700' },
  // Tabs
  tabBar: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tabBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  tabBtnActive: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  tabBtnText: { color: COLORS.textDim, fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: COLORS.accent },
  // Nearby cards
  nearbyMsg: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: SPACING.lg },
  nearbyCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  nearbyCardPhoto: { width: 64, height: 64, borderRadius: RADIUS.sm },
  nearbyCardNoPhoto: { backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  nearbyCardBody: { flex: 1, gap: 2 },
  nearbyCardName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  nearbyCardAddr: { color: COLORS.textMuted, fontSize: 11 },
  nearbyCardMeta: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', marginTop: 1 },
  nearbyCardRating: { color: COLORS.textDim, fontSize: 11 },
  nearbyCardDist: { color: COLORS.textDim, fontSize: 11 },
  nearbyCardMapsBtn: { padding: SPACING.xs, alignSelf: 'center' },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, marginBottom: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 2 },
});
