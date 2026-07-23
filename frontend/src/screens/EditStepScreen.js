import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal,
  Image, Dimensions, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useQuery } from '@powersync/react-native';
import { useRoadtripStore } from '../store/roadtripStore';
import { useAuthStore } from '../store/authStore';
import { useStepPhotos } from '../hooks/usePowerSync';
import { localDeletePhoto, localInsertPhoto, generateId } from '../powersync/localWrite';
import LocationPicker from '../components/LocationPicker';
import DateTimePickerModal from '../components/DateTimePickerModal';
import AccommodationSection from '../components/AccommodationSection';
import ActivitySection from '../components/ActivitySection';
import { useRoadtripSettings } from '../hooks/useRoadtripSettings';
import { validateStepDates } from '../utils/dateValidation';
import { db } from '../powersync/db';
import { localCheckCoherence } from '../powersync/coherenceCheck';
import CoherenceAlertModal from '../components/CoherenceAlertModal';

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
  const { step, initialEditAccommodationId, initialEditActivityId } = route.params;

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
  const { photos } = useStepPhotos(step.id);
  const roadtripSettings = useRoadtripSettings(step.roadtripId);

  // ─── Requêtes items de l'étape ────────────────────────────────────────
  const { data: rawAcs } = useQuery(
    step.id ? 'SELECT checkIn, checkOut FROM accommodations WHERE stepId = ?' : 'SELECT * FROM accommodations WHERE 1=0',
    step.id ? [step.id] : []
  );
  const { data: rawActs } = useQuery(
    step.id ? 'SELECT startTime, endTime FROM activities WHERE stepId = ?' : 'SELECT * FROM activities WHERE 1=0',
    step.id ? [step.id] : []
  );

  const acs = rawAcs ?? [];
  const acts = rawActs ?? [];
  const hasItems = acs.length > 0 || acts.length > 0;

  // ─── Calcul DIRECT des valeurs d'affichage depuis les items ────────────
  // NE PAS utiliser le state, calculer synchrone pendant le render
  let dispStartDate = startDate;
  let dispEndDate = endDate;
  let dispArrivalTime = arrivalTime;
  let dispDepartureTime = departureTime;

  if (hasItems) {
    const allItems = [...acs, ...acts];

    // Helper : extraire { date, time } depuis "YYYY-MM-DD HH:mm" ou "YYYY-MM-DDTHH:mm:SS.000000"
    const splitDt = (str) => {
      if (!str) return { date: null, time: null };
      // Format avec T : "2026-07-31T18:45:00.000000"
      if (str.includes('T')) {
        const [ymd, rest] = str.split('T');
        return { date: parseDate(ymd), time: rest ? rest.slice(0, 5) : null };
      }
      // Format avec espace : "2026-07-31 18:45"
      const p = str.split(' ');
      return { date: parseDate(p[0]), time: p.length > 1 ? p[1] : null };
    };

    let minDt = null, maxDt = null;
    for (const item of allItems) {
      const d = item.checkIn || item.startTime;
      if (d && (!minDt || d < minDt)) minDt = d;
    }
    for (const item of allItems) {
      const d = item.checkOut || item.endTime;
      if (d && (!maxDt || d > maxDt)) maxDt = d;
    }

    // Toujours forcer les heures quand des items existent
    // Si un item a une heure explicite, on l'utilise, sinon 10:00 par défaut
    const FORCED_DEFAULT_TIME = '10:00';

    if (minDt) {
      const { date, time } = splitDt(minDt);
      if (date) dispStartDate = date;
      // Toujours dériver l'affichage depuis les items (réactifs PowerSync)
      // L'arrivalTime de l'étape est mis à jour en base par AccommodationSection.handleSave
      dispArrivalTime = time ?? FORCED_DEFAULT_TIME;
    } else {
      dispArrivalTime = FORCED_DEFAULT_TIME;
    }

    if (maxDt) {
      const { date, time } = splitDt(maxDt);
      if (date) dispEndDate = date;
      dispDepartureTime = time ?? FORCED_DEFAULT_TIME;
    } else {
      dispDepartureTime = dispArrivalTime;
    }
  }

  // URL de la photo de carte — état local pour éviter les re-renders intermédiaires de PowerSync
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(step.photoUrl ?? null);

  // Photo action menu
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [menuPhoto, setMenuPhoto] = useState(null);
  const [coherenceIssues, setCoherenceIssues] = useState(null);

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

  // Ajout photo avec détection du presse-papier
  const handleAddPhoto = async () => {
    // Vérifier si une image est dans le presse-papier
    try {
      const hasImage = await Clipboard.hasImageAsync();
      if (hasImage) {
        // Proposer le collage OU la galerie
        Alert.alert('Ajouter une photo', 'Le presse-papier contient une image.', [
          { text: '📋 Coller', onPress: handlePastePhoto },
          { text: '📁 Choisir dans la galerie', onPress: openGallery },
          { text: 'Annuler', style: 'cancel' },
        ]);
        return;
      }
    } catch { /* Clipboard inaccessible → fallback galerie */ }
    openGallery();
  };

  const openGallery = async () => {
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
    await localInsertPhoto({
      id: generateId(),
      url: asset.uri,
      stepId: step.id,
      roadtripId: step.roadtripId,
      userId,
      createdAt: new Date().toISOString(),
    });
  };

  const handlePastePhoto = async () => {
    try {
      const clipboardImg = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.8 });
      if (!clipboardImg) {
        Alert.alert('Erreur', 'Impossible de récupérer l\'image depuis le presse-papier.');
        return;
      }
      await localInsertPhoto({
        id: generateId(),
        url: clipboardImg.data,
        stepId: step.id,
        roadtripId: step.roadtripId,
        userId,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[PastePhoto] Erreur:', err);
      Alert.alert('Erreur', 'Impossible de coller l\'image.');
    }
  };

  const openDtPicker = (target) => {
    setDtPickerTarget(target);
    setDtPickerVisible(true);
  };

  const fmtDateField = (d) => {
    if (!d) return '--/--';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

  const fmtTimeField = (t) => {
    if (!t) return '--:--';
    if (typeof t === 'string') {
      const hhmm = t.match(/^(\d{2}:\d{2})/);
      if (hhmm?.[1]) return hhmm[1];
    }
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return '--:--';
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Champ requis', "Le nom de l'étape est obligatoire.");
      return;
    }
    const dateErrors = validateStepDates({
      startDate: toLocalDateString(dispStartDate),
      endDate: dispEndDate ? toLocalDateString(dispEndDate) : undefined,
    });
    if (dateErrors.length > 0) {
      Alert.alert('Dates incohérentes', dateErrors.join('\n'));
      return;
    }
    // Calculer les heures effectives depuis les items si l'étape en a
    // (règle : l'étape se cale sur l'horaire le plus tôt de ses items)
    let effectiveArrival = dispArrivalTime;
    let effectiveDeparture = dispDepartureTime;
    if (hasItems) {
      const allItems = [...acs, ...acts];
      const extractTime = (str) => {
        if (!str) return null;
        if (str.includes('T')) return str.split('T')[1]?.slice(0, 5) || null;
        if (str.includes(' ')) return str.split(' ')[1]?.slice(0, 5) || null;
        return /^\d{2}:\d{2}/.test(str) ? str.slice(0, 5) : null;
      };
      let minDt = null, maxDt = null;
      for (const item of allItems) {
        const d = item.checkIn || item.startTime;
        if (d && (!minDt || d < minDt)) minDt = d;
      }
      for (const item of allItems) {
        const d = item.checkOut || item.endTime;
        if (d && (!maxDt || d > maxDt)) maxDt = d;
      }
      const FORCED_DEFAULT_TIME = '10:00';
      if (minDt) {
        const time = extractTime(minDt);
        if (time) effectiveArrival = time;
      } else {
        effectiveArrival = FORCED_DEFAULT_TIME;
      }
      if (maxDt) {
        const time = extractTime(maxDt);
        if (time) effectiveDeparture = time;
      } else {
        effectiveDeparture = effectiveArrival;
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        location: location.trim() || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        startDate: toLocalDateString(dispStartDate),
        endDate: dispEndDate ? toLocalDateString(dispEndDate) : null,
        arrivalTime: effectiveArrival ?? null,
        departureTime: effectiveDeparture ?? null,
        notes: notes.trim() || null,
        stopType: null,
      };
      console.log('[EditStepScreen] 💾 handleSubmit → payload:', JSON.stringify(payload), 'step.id:', step.id);
      await updateStep(step.id, payload);
      // Vérifier la cohérence après sauvegarde
      const roadtripId = step.roadtripId || route.params.roadtripId;
      if (roadtripId && db) {
        const issues = await localCheckCoherence(roadtripId, db);
        if (issues.length > 0) {
          const localIssues = issues.filter(i => i.stepId === step.id);
          if (localIssues.length > 0) {
            setCoherenceIssues(localIssues);
            setLoading(false);
            return; // Ne pas naviguer, laisser l'utilisateur voir l'alerte
          }
        }
      }
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
        {/* ─── Arrivée / Départ ────────────────────────────────────────────── */}
        {/* Arrivée */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Arrivée {hasItems ? <Text style={{ color: COLORS.textDim, fontSize: 10 }}>(calculée depuis les items)</Text> : null}
          </Text>
          <View style={styles.dateSplitRow}>
            <Text style={styles.dateSplitLabel}>Date :</Text>
            <TouchableOpacity
              style={[styles.dateSplitBtn, hasItems && styles.dateBtnForced]}
              onPress={() => { if (!hasItems) openDtPicker('start'); }}
              activeOpacity={hasItems ? 1 : 0.6}
            >
              <Text style={[styles.dateSplitValue, hasItems && { color: COLORS.textDim }]}>{fmtDateField(dispStartDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.dateSplitSep}> </Text>
            <Text style={styles.dateSplitLabel}>Heure :</Text>
            <TouchableOpacity
              style={[styles.dateSplitBtn, hasItems && styles.dateBtnForced]}
              onPress={() => { if (!hasItems) openDtPicker('start'); }}
              activeOpacity={hasItems ? 1 : 0.6}
            >
              <Text style={[styles.dateSplitValue, hasItems && { color: COLORS.textDim }]}>{fmtTimeField(dispArrivalTime)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Départ */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Départ {hasItems ? <Text style={{ color: COLORS.textDim, fontSize: 10 }}>(calculé depuis les items)</Text> : null}
          </Text>
          <View style={styles.dateSplitRow}>
            <Text style={styles.dateSplitLabel}>Date :</Text>
            <TouchableOpacity
              style={[styles.dateSplitBtn, hasItems && styles.dateBtnForced]}
              onPress={() => { if (!hasItems) openDtPicker('end'); }}
              activeOpacity={hasItems ? 1 : 0.6}
            >
              <Text style={[styles.dateSplitValue, hasItems && { color: COLORS.textDim }]}>{fmtDateField(dispEndDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.dateSplitSep}> </Text>
            <Text style={styles.dateSplitLabel}>Heure :</Text>
            <TouchableOpacity
              style={[styles.dateSplitBtn, hasItems && styles.dateBtnForced]}
              onPress={() => { if (!hasItems) openDtPicker('end'); }}
              activeOpacity={hasItems ? 1 : 0.6}
            >
              <Text style={[styles.dateSplitValue, hasItems && { color: COLORS.textDim }]}>{fmtTimeField(dispDepartureTime)}</Text>
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
          stepStartDate={dispStartDate ? toLocalDateString(dispStartDate) : null}
          stepEndDate={dispEndDate ? toLocalDateString(dispEndDate) : null}
          stepArrivalTime={dispArrivalTime ?? null}
          stepDepartureTime={dispDepartureTime ?? null}
          initialEditId={initialEditAccommodationId}
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
          stepStartDate={dispStartDate ? toLocalDateString(dispStartDate) : null}
          stepEndDate={dispEndDate ? toLocalDateString(dispEndDate) : null}
          stepArrivalTime={dispArrivalTime ?? null}
          stepDepartureTime={dispDepartureTime ?? null}
          initialEditId={initialEditActivityId}
        />

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

      {coherenceIssues && (
        <CoherenceAlertModal
          issues={coherenceIssues}
          onClose={() => { setCoherenceIssues(null); navigation.goBack(); }}
          onFix={() => { setCoherenceIssues(null); navigation.goBack(); }}
          onApplySuggestion={(suggestedTime, issue) => {
            const nowStr = new Date().toISOString();
            const fullTime = startDate ? `${toLocalDateString(startDate)} ${suggestedTime}` : suggestedTime;
            Promise.all([
              db.execute('UPDATE steps SET "arrivalTime" = ?, "updatedAt" = ? WHERE id = ?', [suggestedTime, nowStr, issue.stepId]),
              issue.culpritId && issue.culpritType === 'accommodation'
                ? db.execute('UPDATE accommodations SET "checkIn" = ?, "updatedAt" = ? WHERE id = ?', [fullTime, nowStr, issue.culpritId])
                : Promise.resolve(),
            ]).then(() => {
              console.log('[EditStepScreen Suggestion] Arrivée →', suggestedTime);
              setCoherenceIssues(null);
              navigation.goBack();
            }).catch(e => console.warn('[EditStepScreen Suggestion]', e));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  locationWrapper: { paddingHorizontal: SPACING.lg },
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
  dateSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  dateSplitLabel: {
    width: 46,
    color: COLORS.textDim,
    fontSize: 12,
  },
  dateSplitSep: {
    width: 6,
  },
  dateSplitBtn: {
    flex: 1,
    minWidth: 60,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 38,
    justifyContent: 'center',
  },
  dateBtnForced: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    opacity: 0.7,
  },
  dateSplitValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
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
