import React, { useState, useLayoutEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal,
  Image, Dimensions, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useRoadtripStore } from '../store/roadtripStore';
import { useAuthStore } from '../store/authStore';
import { useQuery } from '@powersync/react-native';
import { useStepPhotos } from '../hooks/usePowerSync';
import { localDeletePhoto, localInsertPhoto, generateId } from '../powersync/localWrite';
import LocationPicker from '../components/LocationPicker';
import DateTimePickerModal from '../components/DateTimePickerModal';
import AccommodationSection from '../components/AccommodationSection';
import ActivitySection from '../components/ActivitySection';
import { useRoadtripSettings } from '../hooks/useRoadtripSettings';
import { validateStepDates } from '../utils/dateValidation';

const { width: SCREEN_W } = Dimensions.get('window');



function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return new Date(y, m - 1, d, 12, 0, 0); // midi local — jamais de décalage UTC
}

const toLocalDateString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function EditStepScreen({ route, navigation }) {
  const { step } = route.params;

  const [name, setName] = useState(step.name ?? '');
  const [startDate, setStartDate] = useState(parseDate(step.startDate) ?? new Date());
  const [endDate, setEndDate] = useState(parseDate(step.endDate));
  const [location, setLocation] = useState(step.location ?? '');
  const [latitude, setLatitude] = useState(step.latitude ?? null);
  const [longitude, setLongitude] = useState(step.longitude ?? null);
  const [notes, setNotes] = useState(step.notes ?? '');
  const [arrivalTime, setArrivalTime] = useState(step.arrivalTime ?? null);
  const [departureTime, setDepartureTime] = useState(step.departureTime ?? null);
  const [loading, setLoading] = useState(false);

  // DateTime picker
  const [dtPickerVisible, setDtPickerVisible] = useState(false);
  const [dtPickerTarget, setDtPickerTarget] = useState(null); // 'start' | 'end'

  const { updateStep, deleteStep } = useRoadtripStore();
  const userId = useAuthStore((s) => s.user?.id);

  const miniMapRef = useRef(null);

  const { data: mapAccommodations = [] } = useQuery(
    'SELECT id, latitude, longitude, type FROM accommodations WHERE stepId = ?',
    [step.id]
  );
  const { data: mapActivities = [] } = useQuery(
    'SELECT id, latitude, longitude, type FROM activities WHERE stepId = ?',
    [step.id]
  );

  const computeMapRegion = () => {
    const stepCoord = latitude && longitude
      ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
      : null;
    const allCoords = [
      ...(stepCoord ? [stepCoord] : []),
      ...mapAccommodations.filter(a => a.latitude != null && a.longitude != null)
        .map(a => ({ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) })),
      ...mapActivities.filter(a => a.latitude != null && a.longitude != null)
        .map(a => ({ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) })),
    ];
    if (allCoords.length === 0) return null;
    if (allCoords.length === 1) return { ...allCoords[0], latitudeDelta: 0.05, longitudeDelta: 0.05 };
    const lats = allCoords.map(c => c.latitude);
    const lngs = allCoords.map(c => c.longitude);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.8, 0.02),
      longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.8, 0.02),
    };
  };

  const resetMapToMarker = () => {
    const region = computeMapRegion();
    if (region) miniMapRef.current?.animateToRegion(region, 400);
  };
  const { photos } = useStepPhotos(step.id);
  const roadtripSettings = useRoadtripSettings(step.roadtripId);

  // URL de la photo de carte — état local pour éviter les re-renders intermédiaires de PowerSync
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(step.photoUrl ?? null);

  // Photo action menu
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [menuPhoto, setMenuPhoto] = useState(null);

  const openPhotoMenu = (photo) => {
    setMenuPhoto(photo);
    setPhotoMenuVisible(true);
  };

  const handleSetAsCover = async () => {
    setPhotoMenuVisible(false);
    const url = menuPhoto.url;
    setCoverPhotoUrl(url);
    await updateStep(step.id, { photoUrl: url });
  };

  const handleDeletePhotoConfirmed = async (photo) => {
    // Si c'était la photo de carte, on efface step.photoUrl
    if (photo.url === coverPhotoUrl) {
      setCoverPhotoUrl(null);
      await updateStep(step.id, { photoUrl: null });
    }
    await localDeletePhoto(photo.id);
  };

  const handleDeletePhotoFromMenu = () => {
    setPhotoMenuVisible(false);
    const photo = menuPhoto;
    Alert.alert('Supprimer cette photo ?', null, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => handleDeletePhotoConfirmed(photo) },
    ]);
  };

  // Garde la fonction pour compatibilité (plus utilisée directement depuis le grid)
  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la galerie est requis pour ajouter des photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    // Insertion locale immédiate — PowerSync gère l'upload binaire quand le réseau revient
    await localInsertPhoto({
      id: generateId(),
      url: asset.uri,
      stepId: step.id,
      roadtripId: step.roadtripId,
      userId,
      createdAt: new Date().toISOString(),
    });
  };

  const handleDeletePhoto = (photo) => {
    Alert.alert('Supprimer cette photo ?', null, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => localDeletePhoto(photo.id) },
    ]);
  };

  const openDtPicker = (target) => {
    setDtPickerTarget(target);
    setDtPickerVisible(true);
  };

  const fmtBtn = (d, t) => {
    const s = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return t ? `${s}  ·  ${t}` : s;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Champ requis', "Le nom de l'étape est obligatoire.");
      return;
    }
    const dateErrors = validateStepDates({
      startDate: toLocalDateString(startDate),
      endDate: endDate ? toLocalDateString(endDate) : undefined,
    });
    if (dateErrors.length > 0) {
      Alert.alert('Dates incohérentes', dateErrors.join('\n'));
      return;
    }
    setLoading(true);
    try {
      await updateStep(step.id, {
        name: name.trim(),
        location: location.trim() || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        startDate: toLocalDateString(startDate),
        endDate: endDate ? toLocalDateString(endDate) : null,
        arrivalTime: arrivalTime ?? null,
        departureTime: departureTime ?? null,
        notes: notes.trim() || null,
        stopType: null,
      });
      navigation.goBack();
    } catch {
      Alert.alert('Erreur', "Impossible de modifier l'étape.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer cette étape ?',
      `« ${step.name} » sera définitivement supprimée.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await deleteStep(step.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleSubmitRef = useRef();
  handleSubmitRef.current = handleSubmit;

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

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

      {/* ─── En-tête fixe (hors ScrollView pour éviter FlatList imbriquée) ────────── */}
      <View style={styles.header}>

        {/* ─── Nom ─────────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Paris, Lyon, Chamonix…"
            placeholderTextColor={COLORS.textDim}
          />
        </View>
      </View>

      {/* ─── Location (hors du header View pour éviter le clipping Android) ── */}
      <View style={styles.locationWrapper}>
        <LocationPicker
          initialValue={location}
          onSelect={({ location: loc, latitude: lat, longitude: lng }) => {
            setLocation(loc);
            setLatitude(lat);
            setLongitude(lng);
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">

        {/* ─── Mini-carte ──────────────────────────────────────────────────── */}
        {(() => {
          const region = computeMapRegion();
          if (!region) return null;
          const stepCoord = latitude && longitude
            ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
            : null;
          return (
            <View style={styles.mapCard}>
              <MapView
                ref={miniMapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={region}
                scrollEnabled={true}
                zoomEnabled={true}
                rotateEnabled={false}
                pitchEnabled={false}
                showsUserLocation={false}
                showsCompass={false}
                showsMyLocationButton={false}
              >
                {stepCoord && (
                  <Marker coordinate={stepCoord} anchor={{ x: 0.5, y: 0.5 }} />
                )}
                {mapAccommodations.filter(a => a.latitude != null && a.longitude != null).map((a) => {
                  const accomEmoji = a.type === 'CAMPING' ? '🏕️' : a.type === 'PARKING' ? '🅿️' : a.type === 'OTHER' ? '🏪' : '🏨';
                  return (
                    <Marker
                      key={a.id}
                      coordinate={{ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) }}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={styles.markerAccom}>
                        <Text style={styles.markerEmoji}>{accomEmoji}</Text>
                      </View>
                    </Marker>
                  );
                })}
                {mapActivities.filter(a => a.latitude != null && a.longitude != null).map((a) => {
                  const emoji = a.type === 'RESTAURANT' ? '🍽️' : a.type === 'TRANSPORT' ? '🚌' : a.type === 'ACTIVITY' ? '🎯' : a.type === 'SUPERMARKET' ? '🛒' : a.type === 'HIKING' ? '🥾' : '📌';
                  return (
                    <Marker
                      key={a.id}
                      coordinate={{ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) }}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={styles.markerActivity}>
                        <Text style={styles.markerEmoji}>{emoji}</Text>
                      </View>
                    </Marker>
                  );
                })}
              </MapView>
              <TouchableOpacity style={styles.mapResetBtn} onPress={resetMapToMarker}>
                <MaterialIcons name="my-location" size={20} color="#1a73e8" />
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ─── Arrivée / Départ ────────────────────────────────────────────── */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Arrivée</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => openDtPicker('start')}>
              <Text style={styles.dateBtnText}>{fmtBtn(startDate, arrivalTime)}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ width: SPACING.md }} />
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Départ</Text>
            <TouchableOpacity
              style={[styles.dateBtn, !endDate && styles.dateBtnEmpty]}
              onPress={() => openDtPicker('end')}
            >
              <Text style={[styles.dateBtnText, !endDate && { color: COLORS.textDim }]}>
                {endDate ? fmtBtn(endDate, departureTime) : '+ Ajouter'}
              </Text>
            </TouchableOpacity>
            {endDate && (
              <TouchableOpacity onPress={() => { setEndDate(null); setDepartureTime(null); }} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕ effacer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ─── Notes ───────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Infos utiles, à ne pas oublier…"
            placeholderTextColor={COLORS.textDim}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* ─── Photos ──────────────────────────────────────────────────────── */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Photos</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                onLongPress={() => openPhotoMenu(photo)}
                activeOpacity={0.8}
                style={[
                  styles.photoItem,
                  photo.url === coverPhotoUrl && styles.photoItemCover,
                ]}
              >
                <View style={styles.photoClip}>
                  <Image source={{ uri: photo.url }} style={styles.photoThumb} resizeMode="cover" />
                  {photo.url === coverPhotoUrl && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>★</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handleAddPhoto} style={styles.photoAdd}>
              <Text style={styles.photoAddText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Type d'arrêt (STOP uniquement) ──────────────────────────────── */}
        {/* déplacé dans le header, entre Nom et LocationPicker */}

        {/* ─── Hébergement ──────────────────────────────────────────────────── */}
        <AccommodationSection
          stepId={step.id}
          roadtripId={step.roadtripId}
          userId={userId}
          latitude={latitude ? parseFloat(latitude) : null}
          longitude={longitude ? parseFloat(longitude) : null}
          allowedTypes={roadtripSettings?.suggestionPlaceTypes}
          radius={roadtripSettings?.suggestionRadius}
          stepStartDate={step.startDate ?? null}
          stepEndDate={step.endDate ?? null}
        />

        {/* ─── Activités ───────────────────────────────────────────────────── */}
        <ActivitySection
          stepId={step.id}
          roadtripId={step.roadtripId}
          userId={userId}
          latitude={latitude ? parseFloat(latitude) : null}
          longitude={longitude ? parseFloat(longitude) : null}
          allowedTypes={roadtripSettings?.suggestionPlaceTypes}
          radius={roadtripSettings?.suggestionRadius}
          stepStartDate={step.startDate ?? null}
          stepEndDate={step.endDate ?? null}
        />

        {/* ─── Suppression ─────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>🗑 Supprimer cette étape</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ─── Photo action menu ─────────────────────────────────────────── */}
      <Modal visible={photoMenuVisible} transparent animationType="slide" onRequestClose={() => setPhotoMenuVisible(false)}>
        <Pressable style={styles.photoMenuOverlay} onPress={() => setPhotoMenuVisible(false)}>
          <Pressable style={styles.photoMenuSheet} onPress={() => {}}>
            <View style={styles.photoMenuHandle} />
            <Text style={styles.photoMenuTitle}>Photo</Text>
            <TouchableOpacity style={styles.photoMenuItem} onPress={handleSetAsCover}>
              <Text style={styles.photoMenuIcon}>🖼</Text>
              <Text style={styles.photoMenuLabel}>Définir comme photo de carte</Text>
            </TouchableOpacity>
            <View style={styles.photoMenuDivider} />
            <TouchableOpacity style={styles.photoMenuItem} onPress={handleDeletePhotoFromMenu}>
              <Text style={styles.photoMenuIcon}>🗑</Text>
              <Text style={styles.photoMenuLabelDanger}>Supprimer cette photo</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <DateTimePickerModal
        visible={dtPickerVisible}
        date={dtPickerTarget === 'start' ? startDate : (endDate ?? startDate)}
        time={dtPickerTarget === 'start' ? arrivalTime : departureTime}
        label={dtPickerTarget === 'start' ? "Arrivée" : 'Départ'}
        minDate={dtPickerTarget === 'end' ? startDate : null}
        onConfirm={({ date, time }) => {
          if (dtPickerTarget === 'start') {
            setStartDate(date);
            setArrivalTime(time);
            if (endDate && date > endDate) setEndDate(date);
          } else {
            setEndDate(date);
            setDepartureTime(time);
          }
          setDtPickerVisible(false);
        }}
        onCancel={() => setDtPickerVisible(false)}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  locationWrapper: { paddingHorizontal: SPACING.lg },
  mapCard: {
    marginBottom: SPACING.lg,
    height: 200,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapResetBtn: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 28, height: 28, borderRadius: 3,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 4,
  },
  markerAccom: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1a6b4a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  markerActivity: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#2d4a6b',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  markerEmoji: { fontSize: 15 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  inputGroup: { marginBottom: SPACING.lg },
  row: { flexDirection: 'row', marginBottom: SPACING.lg },
  label: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  dateBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  dateBtnEmpty: { borderStyle: 'dashed' },
  dateBtnText: { color: COLORS.text, fontSize: 14, textAlign: 'center' },
  clearBtn: { marginTop: 4, alignSelf: 'flex-start' },
  clearBtnText: { color: COLORS.textDim, fontSize: 12 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoItem: { width: (SCREEN_W - SPACING.lg * 2 - 16) / 3, aspectRatio: 1, borderRadius: RADIUS.sm },
  photoItemCover: { borderWidth: 2.5, borderColor: COLORS.accent },
  photoClip: { flex: 1, borderRadius: RADIUS.sm, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute', bottom: 3, right: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1,
  },
  coverBadgeText: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
  photoAdd: { width: (SCREEN_W - SPACING.lg * 2 - 16) / 3, aspectRatio: 1, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  photoAddText: { fontSize: 28, color: COLORS.textDim, lineHeight: 32 },
  // Photo action sheet
  photoMenuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  photoMenuSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  photoMenuHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md },
  photoMenuTitle: { fontFamily: FONTS.title, fontSize: 18, color: COLORS.text, marginBottom: SPACING.md },
  photoMenuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
  photoMenuItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  photoMenuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  photoMenuLabel: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  photoMenuLabelDanger: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
  typePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '22' },
  typeIcon: { fontSize: 16 },
  typeLabel: { fontSize: 13, color: COLORS.textDim, fontWeight: '600' },
  typeLabelActive: { color: COLORS.accent },
  deleteBtn: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.md,
  },
  deleteBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '600' },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.bg, fontFamily: FONTS.bodyBold, fontSize: 15, fontWeight: '700' },
});
