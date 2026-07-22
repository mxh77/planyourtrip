import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  ScrollView, StatusBar, Alert, ActivityIndicator,
  Modal, TextInput, Platform, Pressable, Linking,
  Image,
} from 'react-native';
import { useQuery } from '@powersync/react-native';
import MapView, { Marker, Polyline, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useRoadtripStore } from '../store/roadtripStore';
import { useRoadtripRole } from '../hooks/useRoadtripRole';
import { localUpdateAccommodation, localUpdateActivity } from '../powersync/localWrite';
import API_URL from '../api/config';
import { log, warn } from '../services/logger';
import { LogsViewer } from '../components/LogsViewer';
import StepCarousel from '../components/StepCarousel';
import { getEnabledCategories } from '../constants/categories';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Constantes ──────────────────────────────────────────────────────────────
const CAROUSEL_BOTTOM = 195; // Hauteur du carrousel (CARD_HEIGHT 175 + padding 20)

const ORDER_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

const ACCOM_ICONS = {
  HOTEL: '🏨', AIRBNB: '🏠', CAMPING: '🏕️', HOSTEL: '🛏️', OTHER: '🏪',
};

const ACTIVITY_ICONS = {
  ACTIVITY: '🎯', RESTAURANT: '🍽️', TRANSPORT: '🚌', HIKING: '🥾', SUPERMARKET: '🛒', OTHER: '📌',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d, opts = { day: 'numeric', month: 'short' }) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  // Check if options include time
  const hasTime = opts.hour || opts.minute;
  const formatOpts = {
    day: opts.day || 'numeric',
    month: opts.month || 'short',
    ...(opts.hour && { hour: opts.hour }),
    ...(opts.minute && { minute: opts.minute }),
    ...(opts.year && { year: opts.year }),
  };
  return hasTime
    ? date.toLocaleString('fr-FR', formatOpts)
    : date.toLocaleDateString('fr-FR', formatOpts);
}

function formatTime(t) {
  if (!t) return null;
  if (typeof t === 'string') {
    const hhmm = t.match(/^(\d{2}:\d{2})/);
    if (hhmm?.[1]) return hhmm[1];
  }
  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return null;
}

// Convertir une date en string YYYY-MM-DD (indépendant du fuseau horaire)
function toYMD(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Décoder polyline (format Google Directions)
function decodePolyline(encoded) {
  const poly = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return poly;
}

function durationDays(start, end) {
  if (!start || !end) return 0;
  try {
    const d = Math.round((new Date(end) - new Date(start)) / 86400000);
    return d > 0 ? d : 0;
  } catch (err) {
    console.error('[durationDays] Erreur:', err);
    return 0;
  }
}

function computeRegion(steps) {
  if (!steps?.length) return { latitude: 46.2276, longitude: 2.2137, latitudeDelta: 10, longitudeDelta: 10 };
  const lats = steps.map(s => parseFloat(s.latitude)).filter(n => !isNaN(n));
  const lngs = steps.map(s => parseFloat(s.longitude)).filter(n => !isNaN(n));
  if (!lats.length) return { latitude: 46.2276, longitude: 2.2137, latitudeDelta: 10, longitudeDelta: 10 };
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + 1.0, 0.08),
    longitudeDelta: Math.max(maxLng - minLng + 1.0, 0.08),
  };
}

// Ref module-level pour overrides immédiats des flags (contourne délai PowerSync)
const _depArrOverride = { current: {} };

// Coordonnées effectives de départ pour une étape (item avec isDeparture sinon l'étape elle-même)
function getStepDeparture(step, accommodations, activities) {
  const stepItems = [...accommodations, ...activities].filter(a => a.stepId === step.id);
  for (const item of stepItems) {
    const override = _depArrOverride.current[item.id];
    const isDep = (override && 'isDeparture' in override) ? override.isDeparture : item.isDeparture;
    if (isDep && item.latitude && item.longitude) {
      return { lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) };
    }
  }
  return { lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) };
}

// Coordonnées effectives d'arrivée pour une étape (item avec isArrival sinon l'étape elle-même)
function getStepArrival(step, accommodations, activities) {
  const stepItems = [...accommodations, ...activities].filter(a => a.stepId === step.id);
  for (const item of stepItems) {
    const override = _depArrOverride.current[item.id];
    // Utiliser l'override si la propriété existe, sinon fallback sur la valeur PowerSync
    const isArr = (override && 'isArrival' in override) ? override.isArrival : item.isArrival;
    if (isArr && item.latitude && item.longitude) {
      return { lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) };
    }
  }
  return { lat: parseFloat(step.latitude), lng: parseFloat(step.longitude) };
}

// ─── Données mock pour prototype ─────────────────────────────────────────────
// ─── StepCard (compact pour la liste) ────────────────────────────────────────
// ─── StepCard (compact pour la liste) — SUPPRIMÉE, utiliser StepCarousel ─────

// ─── Detail card pour l'étape active (mode collapsed) ────────────────────────
function CurrentStepBar({ step, index, color, onPress, isOverview = false, roadtrip = null, totalDays = 0 }) {
  if (isOverview && roadtrip) {
    // Affichage en mode vue globale du roadtrip
    return (
      <TouchableOpacity style={styles.currentBar} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.currentDot, { backgroundColor: '#8b5cf6' }]}>
          <Text style={styles.currentDotText}>🗺️</Text>
        </View>
        <View style={styles.currentInfo}>
          <Text style={styles.currentName}>{roadtrip.title}</Text>
          <Text style={styles.currentMeta}>
            📍 Vue d'ensemble • {totalDays} jour{totalDays > 1 ? 's' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Affichage normal : détail d'une étape
  if (!step) return null;

  const nights = durationDays(step.startDate, step.endDate);

  // Formatter les dates avec heures si disponibles
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const hasTime = dateStr.includes('T');
    if (hasTime) {
      return date.toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <TouchableOpacity style={styles.currentBar} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.currentDot, { backgroundColor: color }]}>
        <Text style={styles.currentDotText}>{index + 1}</Text>
      </View>
      <View style={styles.currentInfo}>
        <Text style={styles.currentName}>{step.name}</Text>
        {(step.distanceFromPrev || 0) > 0 && (
          <Text style={styles.currentTrajet}>
            🚐 {step.distanceFromPrev || 0} km · {(step.durationFromPrev || 0) >= 60 ? `${Math.floor((step.durationFromPrev || 0) / 60)}h${String(Math.round((step.durationFromPrev || 0) % 60)).padStart(2, '0')}` : `${Math.round(step.durationFromPrev || 0)}min`}
          </Text>
        )}
        <Text style={styles.currentMeta}>
          {step.endDate
            ? `${nights || 0} nuit${(nights || 0) > 1 ? 's' : ''} · ${step.startDate ? formatDateTime(step.startDate) : ''} → ${formatDateTime(step.endDate)}`
            : step.startDate ? formatDateTime(step.startDate) : 'Date non définie'}
        </Text>
        {(step.arrivalTime || step.departureTime) && (
          <Text style={styles.currentMeta}>
            🕒 {formatTime(step.arrivalTime) ?? '--:--'}{step.arrivalTime && step.departureTime ? ' → ' : ''}{formatTime(step.departureTime) ?? ''}
          </Text>
        )}
      </View>
      {step.accommodation?.status === 'BOOKED' && (
        <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>🏕️ ✅</Text></View>
      )}
    </TouchableOpacity>
  );
}

// ─── Helpers for bounds adjustment ──────────────────────────────────────────
// Le carrousel (~195px) + le navigateur d'étape (~44px) masquent le bas de la carte.
const HEADER_HEIGHT_ESTIMATE = 100;
const BOTTOM_HIDDEN_PX = CAROUSEL_BOTTOM + 44;
function adjustBoundsForSheet(bounds) {
  if (!bounds) return null;
  const mapTotalH = SCREEN_H - HEADER_HEIGHT_ESTIMATE; // hauteur estimée de la carte en px
  const hiddenRatio = BOTTOM_HIDDEN_PX / mapTotalH;    // proportion masquée en bas
  const latRange = bounds.ne.lat - bounds.sw.lat;
  return {
    ne: { lat: bounds.ne.lat, lng: bounds.ne.lng },
    sw: {
      lat: bounds.sw.lat + latRange * hiddenRatio,  // remonter le sud
      lng: bounds.sw.lng,
    },
  };
}

// ─── Category search buttons — chargés dynamiquement depuis les settings ─────

// ─── Écran principal ─────────────────────────────────────────────────────────
export default function RoadtripDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const insets = useSafeAreaInsets();

  // 🔍 Tracer mount/unmount du composant (pour vérifier si un useRef survit à la navigation)
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    console.log(`[LIFECYCLE] ▶️ MOUNT RoadtripDetailScreen instance=${instanceIdRef.current} roadtripId=${id}`);
    return () => {
      console.log(`[LIFECYCLE] ⏹️ UNMOUNT RoadtripDetailScreen instance=${instanceIdRef.current} roadtripId=${id}`);
    };
  }, []);

  // Charger les steps depuis PowerSync
  const { data: psSteps = [] } = useQuery(
    'SELECT * FROM steps WHERE roadtripId = ? ORDER BY "order" ASC',
    [id]
  );

  // Charger les accommodations et activities
  const { data: psAccommodations = [] } = useQuery(
    'SELECT * FROM accommodations WHERE roadtripId = ?',
    [id]
  );

  const { data: psActivities = [] } = useQuery(
    'SELECT * FROM activities WHERE roadtripId = ?',
    [id]
  );

  // 🎯 Ref pour cache les distances enrichies (doit être avant transformedSteps qui l'utilise)
  const distancesMapRef = useRef({});
  const [distancesVersion, setDistancesVersion] = useState(0);  // 🎯 Counter pour trigger re-render du cache
  const [polylinesLoaded, setPolylinesLoaded] = useState(false);  // Doit être AVANT le useMemo qui l'utilise

  // Clés stables pour les arrays PowerSync — évite que le useMemo se re-déclenche
  // à chaque sync PowerSync qui retourne une nouvelle référence avec les mêmes données.
  // Inclure les champs visibles/éditables d'une étape pour refléter immédiatement les sauvegardes.
  const psStepsKey = useMemo(
    () => psSteps.map(s => `${s.id}:${s.order}:${s.name ?? ''}:${s.location ?? ''}:${s.startDate ?? ''}:${s.endDate ?? ''}:${s.arrivalTime ?? ''}:${s.departureTime ?? ''}:${s.notes ?? ''}:${s.latitude ?? ''}:${s.longitude ?? ''}:${s.photoUrl ?? ''}`).join(','),
    [psSteps]
  );
  const psAccKey = useMemo(
    () => psAccommodations.map(a => `${a.id}:${a.isDeparture ? '1' : '0'}:${a.isArrival ? '1' : '0'}:${a.updatedAt || ''}`).join(','),
    [psAccommodations]
  );
  const psActKey = useMemo(
    () => psActivities.map(a => `${a.id}:${a.isDeparture ? '1' : '0'}:${a.isArrival ? '1' : '0'}:${a.updatedAt || ''}`).join(','),
    [psActivities]
  );

  // Transformer les steps PowerSync en format utilisable
  const transformedSteps = useMemo(() => {
    if (psSteps.length === 0) return [];

    const result = psSteps.map((step, idx) => {
      const stepAccommodations = psAccommodations.filter(a => a.stepId === step.id);
      const stepActivities = psActivities.filter(a => a.stepId === step.id);

      // 🎯 PRIORITE 1 : Utiliser les distances du cache (vraies distances Google Routes)
      if (distancesMapRef.current[step.id]) {
        const { distance, duration } = distancesMapRef.current[step.id];
        return {
          ...step,
          distanceFromPrev: distance,
          durationFromPrev: duration,
          accommodation: stepAccommodations.length > 0 ? { ...stepAccommodations[0], status: 'BOOKED' } : null,
          activities: stepActivities,
        };
      }

      // FALLBACK : pas encore de distances en cache
      return {
        ...step,
        distanceFromPrev: 0,
        durationFromPrev: 0,
        accommodation: stepAccommodations.length > 0 ? { ...stepAccommodations[0], status: 'BOOKED' } : null,
        activities: stepActivities,
      };
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psStepsKey, psAccKey, psActKey, id, polylinesLoaded, distancesVersion]);  // Clés stables = pas de boucle PowerSync

  // États
  const [steps, setSteps] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState({});
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [mapType, setMapType] = useState('standard');  // 'standard' | 'satellite'
  // Recherche par catégorie (boutons Google Maps style)
  const [categoryResults, setCategoryResults] = useState({});     // { campings: [...], trails: [...], ... }
  const [categoryLoading, setCategoryLoading] = useState({});     // { campings: true, ... }
  const [searchBounds, setSearchBounds] = useState(null);         // { ne: {lat,lng}, sw: {lat,lng} } — pour le rectangle
  // Charger le roadtrip depuis PowerSync (réactif)
  const { data: psRoadtripRows } = useQuery(
    'SELECT * FROM roadtrips WHERE id = ?',
    [id]
  );
  const psRoadtrip = psRoadtripRows?.[0];

  // État local pour les catégories activées
  // Priorité : 1) API fraîche au focus, 2) PowerSync, 3) defaults
  const [enabledKeys, setEnabledKeys] = useState(null);
  const [trailDistanceFilter, setTrailDistanceFilter] = useState({ min: null, max: null });

  // Au focus de l'écran (retour depuis Paramètres), recharger via API
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const fetchSettings = async () => {
        try {
          const token = useAuthStore.getState().token;
          const res = await fetch(`${API_URL}/api/roadtrips/${id}/settings`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.enabledQuickSearch) {
              setEnabledKeys(data.enabledQuickSearch);
            }
            if (data.trailDistanceFilter) {
              setTrailDistanceFilter({
                min: data.trailDistanceFilter.min || null,
                max: data.trailDistanceFilter.max || null,
              });
            }
          }
        } catch { }
      };
      fetchSettings();
    });
    return unsubscribe;
  }, [navigation, id]);

  // Charger les catégories activées depuis les settings
  const categoryButtons = useMemo(() => {
    // Priorité 1 : état local (API fraîche au focus)
    if (enabledKeys) return getEnabledCategories(enabledKeys, false);
    // Priorité 2 : PowerSync
    try {
      const settings = psRoadtrip?.settings;
      const parsed = typeof settings === 'string' ? JSON.parse(settings) : settings;
      const psKeys = parsed?.enabledQuickSearch;
      if (psKeys) return getEnabledCategories(psKeys, false);
    } catch { }
    // Fallback : defaults
    return getEnabledCategories(null, true);
  }, [enabledKeys, psRoadtrip?.settings]);

  // Charger le filtre distance depuis les settings (fallback PowerSync si jamais récupéré via API)
  const effectiveTrailFilter = useMemo(() => {
    if (trailDistanceFilter.min != null || trailDistanceFilter.max != null) return trailDistanceFilter;
    try {
      const settings = psRoadtrip?.settings;
      const parsed = typeof settings === 'string' ? JSON.parse(settings) : settings;
      const psFilter = parsed?.trailDistanceFilter;
      if (psFilter) return { min: psFilter.min || null, max: psFilter.max || null };
    } catch { }
    return { min: null, max: null };
  }, [trailDistanceFilter, psRoadtrip?.settings]);

  const [roadtrip, setRoadtrip] = useState({ title: psRoadtrip?.title ?? 'Europe', distance: 3610, id: psRoadtrip?.id ?? id });
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [routes, setRoutes] = useState([]);  // Itinéraires entre étapes
  const [routesVersion, setRoutesVersion] = useState(0);  // Incrémenté pour forcer le re-render natif des Polyline
  const [loadingFromAPI, setLoadingFromAPI] = useState(false);
  const [showLogs, setShowLogs] = useState(false);  // Pour afficher le viewer de logs
  const [refreshingRoutes, setRefreshingRoutes] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchResultMarker, setSearchResultMarker] = useState(null);  // Marqueur de résultat de recherche
  const [showSearchResultModal, setShowSearchResultModal] = useState(false);  // Modal d'options
  const [menuMarker, setMenuMarker] = useState(null); // { item, type: 'accommodation'|'activity', stepId }
  const [showMarkerMenu, setShowMarkerMenu] = useState(false);
  // Note: polylinesLoaded est déclaré plus haut (avant le useMemo transformedSteps)
  const shouldRefreshRef = useRef(false);  // Ref pour éviter infinite loop sur refreshingRoutes
  const [refreshCounter, setRefreshCounter] = useState(0);  // Trigger pour le useEffect directions

  // Créer une clé stable des steps pour éviter re-trigger inutile quand PowerSync retourne une nouvelle array
  const stepsLength = steps.length;

  // Mettre à jour la ref quand utilisateur clique 🔄 Refresh
  useEffect(() => {
    log('REFRESH', `État refreshingRoutes: ${refreshingRoutes}`);
    if (refreshingRoutes) {
      log('REFRESH', '🔄 >>> REFRESH DÉCLENCHÉ <<<');
      shouldRefreshRef.current = true;
      // Réinitialiser les flags pour forcer le rechargement complet
      polylinesFetchedRef.current = false;
      polylinesRef.current = [];
      polylinesLoadingRef.current = false;
      directionsCalculatedRef.current = false;
      setRefreshingRoutes(false);
      setRefreshCounter(c => c + 1);  // Trigger le second useEffect
    }
  }, [refreshingRoutes]);

  // Réinitialiser les states quand on change de roadtrip
  useEffect(() => {
    console.log('[RoadtripDetail] 🔄 Roadtrip id:', id);
    setSelectedIndex(-1);  // -1 = vue globale du roadtrip
    setShowDetail(false);
    setActiveOverlays({});
    setShowSearchArea(false);
    setSearchQuery('');
    setSuggestions([]);
    setRoutes([]);
    setLoadingFromAPI(false);
    polylinesFetchedRef.current = false;  // 🎯 Reset pour que premier useEffect recharge
    polylinesRef.current = [];  // 🎯 Clear la ref
    polylinesLoadingRef.current = false;  // 🎯 Reset flag
    directionsCalculatedRef.current = false;  // 🎯 Reset le flag
  }, [id]);

  // Mettre à jour le roadtrip quand les données PowerSync arrivent
  useEffect(() => {
    if (psRoadtrip) {
      setRoadtrip(prev => ({ ...prev, ...psRoadtrip, id: psRoadtrip.id ?? id }));
    }
  }, [psRoadtrip, id]);

  // Ref qui mémorise les surcharges de departure/arrival définies via le menu marqueur
  // Indépendante des re-renders, survit aux syncs PowerSync
  // Mettre à jour steps quand transformedSteps change
  useEffect(() => {
    setSteps(transformedSteps);
  }, [transformedSteps]);

  // Clé qui ne change que quand les FLAGS isDeparture/isArrival changent
  const psDepArrKey = useMemo(
    () => psAccommodations.map(a => `${a.id}:${a.isDeparture ? '1' : '0'}:${a.isArrival ? '1' : '0'}`).join(',') + '|' +
      psActivities.map(a => `${a.id}:${a.isDeparture ? '1' : '0'}:${a.isArrival ? '1' : '0'}`).join(','),
    [psAccommodations, psActivities]
  );

  // 🔍 Logger les routes réellement commitées (vérifier le point de départ de route 2)
  useEffect(() => {
    const r2 = routes[2];
    if (r2?.coordinates?.[0]) {
      console.log('[Routes-CMTD] Route 2 premier point: (', r2.coordinates[0].latitude.toFixed(4), ',', r2.coordinates[0].longitude.toFixed(4), ')');
    }
  }, [routes]);

  // Au démarrage (quand les étapes sont chargées), zoomer sur tout le roadtrip
  useEffect(() => {
    if (steps.length > 0 && selectedIndex === -1 && mapRef.current) {
      const coords = getRoadtripCoordinates(steps, psAccommodations, psActivities);
      if (coords.length > 0) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: {
            top: 80,
            right: 40,
            bottom: CAROUSEL_BOTTOM + 20,
            left: 40,
          },
          animated: true,
        });
      }
    }
  }, [steps.length, selectedIndex, psAccommodations, psActivities, getRoadtripCoordinates]);

  // (Désactivé : PowerSync synce maintenant correctement, pas besoin de fallback API)
  // Si besoin futur (mode offline), on peut restaurer avec une meilleure logique

  // Charger les polylines sauvegardées depuis l'API au démarrage (PowerSync ne les inclut pas)
  const polylinesFetchedRef = useRef(false);
  const polylinesLoadingRef = useRef(false);  // Flag pour éviter le recalcul pendant le chargement
  const polylinesRef = useRef([]);  // 🎯 Garder les polylines pour éviter qu'elles soient écrasées
  const directionsCalculatedRef = useRef(false);  // 🎯 Tracker que directions est fait
  useEffect(() => {
    if (polylinesFetchedRef.current || stepsLength === 0) return;

    polylinesLoadingRef.current = true;  // Bloquer le recalcul ci-dessous
    const loadPolylines = async () => {
      try {
        const token = useAuthStore.getState().token;
        if (!token) return;

        const res = await fetch(`${API_URL}/api/roadtrips/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const stepsWithPolylines = data.steps || [];

          // Construire les routes depuis les polylines sauvegardées
          const routesFromDB = [];
          const distancesMap = {}; // Map stepId -> { distance, duration }

          for (let i = 0; i < stepsWithPolylines.length - 1; i++) {
            const current = stepsWithPolylines[i];
            const next = stepsWithPolylines[i + 1];  // L'étape SUIVANTE
            if (current.routeEncodedPolyline) {
              try {
                const coordinates = decodePolyline(current.routeEncodedPolyline);
                routesFromDB.push({
                  coordinates,
                  color: ORDER_COLORS[i % ORDER_COLORS.length],
                });
                // La distance est pour NEXT step (distanceFromPrev pour next)
                distancesMap[next.id] = {
                  distance: Math.round(current.routeDistanceMeters / 1000) || 0,  // Convertir en km
                  duration: Math.round(current.routeDurationSeconds / 60) || 0,    // Convertir en minutes
                };
              } catch (err) {
                console.log('[Directions] Erreur décodage:', err.message);
              }
            }
          }

          if (routesFromDB.length > 0) {
            console.log('[Directions] ✓', routesFromDB.length, 'polylines chargées depuis API');
            polylinesRef.current = routesFromDB;
            setRoutes(routesFromDB);  // Toujours afficher le cache immédiatement

            // Recalculer les distances manquantes (distance=0 en DB) via Google API
            const token = useAuthStore.getState().token;
            for (let i = 0; i < stepsWithPolylines.length - 1; i++) {
              const current = stepsWithPolylines[i];
              const next = stepsWithPolylines[i + 1];
              if (current.routeEncodedPolyline && (
                !current.routeDistanceMeters || current.routeDistanceMeters === 0 ||
                !current.routeDurationSeconds || current.routeDurationSeconds === 0
              )) {
                if (!current.latitude || !next.latitude) continue;
                try {
                  const resp = await fetch(`${API_URL}/api/routes/compute`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      origin: getStepDeparture(current, psAccommodations, psActivities),
                      destination: getStepArrival(next, psAccommodations, psActivities),
                      alternatives: false,
                    }),
                  });
                  const rdata = await resp.json();
                  const route = rdata.routes?.[0];
                  if (route) {
                    const distM = route.distanceMeters || 0;
                    const durS = typeof route.duration === 'string' ? parseInt(route.duration) : (route.duration?.seconds ? parseInt(route.duration.seconds) : 0);
                    distancesMap[next.id] = { distance: Math.round(distM / 1000), duration: Math.round(durS / 60) };
                    // Persister en BD
                    await fetch(`${API_URL}/api/steps/${current.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ routeDistanceMeters: distM, routeDurationSeconds: durS }),
                    });
                    console.log('[Directions] ✓ Distance recalculée pour route', i, ':', Math.round(distM / 1000), 'km');
                  }
                } catch (e) {
                  console.log('[Directions] Erreur recalcul distance route', i, e.message);
                }
              }
            }

            distancesMapRef.current = distancesMap;
            setDistancesVersion(v => v + 1);
            setPolylinesLoaded(true);
            polylinesFetchedRef.current = true;
          } else {
            console.log('[Directions] ⚠️ routesFromDB.length === 0, setDistancesVersion NE SERA PAS APPELÉ!');  // 🎯 DEBUG
          }
        }
      } catch (err) {
        console.log('[Directions] Erreur chargement polylines API:', err.message);
      } finally {
        polylinesLoadingRef.current = false;  // Débloquer le recalcul
        // Forcer un re-render pour que le second useEffect (loadRoutes) puisse se déclencher
        // Ne PAS mettre directionsCalculatedRef à true ici : on veut que depArrChanged soit false
        // au premier chargement (les polylines en cache sont déjà bonnes).
        // directionsCalculatedRef sera mis à true seulement APRÈS le premier passage de loadRoutes
        setRefreshCounter(c => c + 1);
      }
    };

    loadPolylines();
  }, [stepsLength, id]);

  const mapRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Dernière version des flags connue lors du dernier calcul des routes
  // Initialisé à null pour que depArrChanged soit true au premier chargement
  const lastDepArrKeyRef = useRef(null);
  // Ref pour stocker l'état des flags item par item (détection précise des changements)
  const lastDepArrKeysRef = useRef({});

  // Charger les itinéraires : d'abord depuis la BD, puis recalculer si refreshing + SAUVEGARDER
  useEffect(() => {
    const depArrChanged = directionsCalculatedRef.current && lastDepArrKeyRef.current !== psDepArrKey;
    log('DIRECTIONS', `useEffect déclenché: stepsLength=${stepsLength}, refreshCounter=${refreshCounter}, shouldRefresh=${shouldRefreshRef.current}, depArrChanged=${depArrChanged}`);
    const loadRoutes = async () => {
      const needsRefresh = shouldRefreshRef.current;  // Manuel (bouton refresh) → toutes les routes
      // Flag changé → routes impactées uniquement. Ignorer au premier chargement (lastDepArrKeyRef === null)
      // car les polylines en cache DB sont déjà bonnes
      const needsFlagRecalc = depArrChanged && lastDepArrKeyRef.current !== null;
      shouldRefreshRef.current = false;

      // État courant des flags (doit être AVANT les guards car utilisé par lastDepArrKeysRef)
      // Inclure l'ID de l'item dans la clé pour détecter les changements entre items d'une même étape
      // Appliquer les overrides locaux (contourne le délai PowerSync)
      const currFlags = {};
      psAccommodations.concat(psActivities).forEach(item => {
        const override = _depArrOverride.current[item.id];
        const isDep = override !== undefined ? override.isDeparture : item.isDeparture;
        const isArr = override !== undefined ? override.isArrival : item.isArrival;
        if (isDep) currFlags[`dep:${item.stepId}:${item.id}`] = true;
        if (isArr) currFlags[`arr:${item.stepId}:${item.id}`] = true;
      });
      // Si le cache des polylines n'est pas encore rempli, attendre (loadPolylines async pas fini)
      if (polylinesRef.current.length === 0) {
        log('DIRECTIONS', '[WAIT] Cache polylines vide, on attend loadPolylines');
        return;
      }

      log('DIRECTIONS', `loadRoutes: needsRefresh=${needsRefresh}, needsFlagRecalc=${needsFlagRecalc}`);

      // Vérifier s'il y a des overrides locaux en attente (contourne le délai PowerSync)
      const hasOverride = Object.keys(_depArrOverride.current).length > 0;
      // Vérifier s'il y a des flags actifs en base (besoin de recalcul au premier chargement uniquement)
      const hasActiveFlags = lastDepArrKeyRef.current === null && Object.keys(currFlags).length > 0;
      const shouldProcess = needsRefresh || needsFlagRecalc || hasOverride || hasActiveFlags;
      // 🎯 GARDE : skip si tout va bien, SAUF si besoin de recalcul
      if (!shouldProcess && (polylinesLoadingRef.current || polylinesFetchedRef.current)) {
        directionsCalculatedRef.current = true;
        lastDepArrKeyRef.current = psDepArrKey;
        lastDepArrKeysRef.current = currFlags;
        return;
      }

      // 🎯 GARDE 2 : directions déjà calculées et rien à traiter
      if (directionsCalculatedRef.current && !shouldProcess) {
        if (polylinesRef.current.length > 0) {
          setRoutes(polylinesRef.current);
        }
        return;
      }

      if (steps.length < 2) return;

      // Initialiser newRoutes avec les polylines existantes, puis écraser les routes recalculées
      const newRoutes = polylinesRef.current.length > 0 ? [...polylinesRef.current] : [];
      const polylinesToSave = {}; // { stepIndex: encodedPolyline }

      // Étape 1: Charger les polylines existantes depuis la BD (skip si besoin de recalcul)
      if (!shouldProcess) {
        const distancesFromBD = {}; // 🎯 Cache les distances existantes
        for (let i = 0; i < steps.length - 1; i++) {
          const current = steps[i];
          const next = steps[i + 1];
          if (current.routeEncodedPolyline) {
            try {
              const coordinates = decodePolyline(current.routeEncodedPolyline);
              newRoutes.push({
                coordinates,
                color: ORDER_COLORS[i % ORDER_COLORS.length],
              });

              // 🎯 Remplir le cache avec les distances existantes
              if (current.routeDistanceMeters && current.routeDurationSeconds) {
                distancesFromBD[next.id] = {
                  distance: Math.round(current.routeDistanceMeters / 1000),
                  duration: Math.round(current.routeDurationSeconds / 60),
                };
              }
            } catch (err) {
              console.log('[Directions] Erreur décodage polyline:', err.message);
            }
          }
        }

        // 🎯 Mettre à jour le cache avec les distances existantes
        if (Object.keys(distancesFromBD).length > 0) {
          console.log('[Directions] ✅ Distances chargées depuis BD:', Object.keys(distancesFromBD).length, 'steps');
          distancesMapRef.current = { ...distancesMapRef.current, ...distancesFromBD };
          setDistancesVersion(v => v + 1);
        }

        if (newRoutes.length === steps.length - 1) {
          console.log('[Directions] Toutes les routes chargées depuis BD');
          if (!needsRefresh && polylinesRef.current.length > 0) {
            setRoutes(polylinesRef.current);
          } else {
            setRoutes(newRoutes);
          }
          lastDepArrKeyRef.current = psDepArrKey;
          directionsCalculatedRef.current = true;
          return;
        }
      }

      // Étape 2: Recalculer les routes manquantes (ou toutes si refreshing)
      // 🎯 AUSSI recalculer les routes avec distance = 0
      const routesNeedingRecalc = [];
      // Identifier PRÉCISÉMENT quels flags ont changé en comparant AVANT vs MAINTENANT
      const prevFlags = lastDepArrKeysRef?.current ?? {};
      lastDepArrKeysRef.current = currFlags;
      // Un flag a changé si un item n'est plus flagué ou si un nouvel item est flagué
      // Le format de clé est "dep:stepId:itemId" ou "arr:stepId:itemId"
      const changedFlags = new Set();
      Object.keys({ ...prevFlags, ...currFlags }).forEach(k => {
        if (prevFlags[k] !== currFlags[k]) {
          const parts = k.split(':');
          const stepId = parts[1]; // dep:stepId:itemId → index 1 = stepId
          changedFlags.add(stepId);
        }
      });
      for (let i = 0; i < steps.length - 1; i++) {
        const current = steps[i];
        const next = steps[i + 1];
        const hasPolyline = current.routeEncodedPolyline;
        const hasDistance = current.routeDistanceMeters && current.routeDistanceMeters > 0;
        const isImpactedByFlag = changedFlags.has(current.id) || changedFlags.has(next.id);
        // Vérifier si l'étape courante ou suivante a un item flaggé (via override ou PowerSync)
        const hasFlagOnStep = (sid) => Object.keys(currFlags).some(k => k.startsWith(`dep:${sid}:`) || k.startsWith(`arr:${sid}:`));
        const isFlagged = hasFlagOnStep(current.id) || hasFlagOnStep(next.id);

        const needsRecalc = needsRefresh
          ? true  // Refresh manuel → toutes
          : needsFlagRecalc
            ? isImpactedByFlag  // Flag changé → seulement les impactées
            : (hasOverride || hasActiveFlags)
              ? isFlagged  // Flags actifs → routes avec item flaggé
              : !hasPolyline || !hasDistance;  // Sinon → polyline ou distance manquante
        if (needsRecalc) routesNeedingRecalc.push(i);
      }

      log('DIRECTIONS', `Routes à recalculer: ${routesNeedingRecalc.length} index: ${routesNeedingRecalc.join(', ')}`);

      if (routesNeedingRecalc.length === 0) {
        log('DIRECTIONS', '✓ Toutes les routes OK (polyline + distance > 0)');
        if (!needsRefresh && !needsFlagRecalc && !hasOverride && !hasActiveFlags && polylinesRef.current.length > 0) {
          setRoutes(polylinesRef.current);
        } else {
          setRoutes(newRoutes);
        }
        setRefreshingRoutes(false);
        lastDepArrKeyRef.current = psDepArrKey;
        directionsCalculatedRef.current = true;
        return;
      }

      try {
        const token = useAuthStore.getState().token;
        // Paralléliser les appels Google Routes API pour éviter l'attente séquentielle
        const routeResults = await Promise.all(routesNeedingRecalc.map(async (i) => {
          const current = steps[i];
          const next = steps[i + 1];
          const result = { i, coordinates: null, polylineData: null };

          if (!current.latitude || !current.longitude || !next.latitude || !next.longitude) {
            const dep = getStepDeparture(current, psAccommodations, psActivities);
            const arr = getStepArrival(next, psAccommodations, psActivities);
            result.coordinates = [
              { latitude: dep.lat, longitude: dep.lng },
              { latitude: arr.lat, longitude: arr.lng },
            ];
            return result;
          }

          try {
            const origin = getStepDeparture(current, psAccommodations, psActivities);
            const dest = getStepArrival(next, psAccommodations, psActivities);
            const response = await fetch(`${API_URL}/api/routes/compute`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ origin, destination: dest, alternatives: false }),
            });

            const data = await response.json();
            if (data.routes?.[0]?.polyline?.encodedPolyline) {
              const route = data.routes[0];
              result.coordinates = decodePolyline(route.polyline.encodedPolyline);
              result.polylineData = {
                polyline: route.polyline.encodedPolyline,
                distance: route.distanceMeters || 0,
                duration: typeof route.duration === 'string' ? parseInt(route.duration) : (route.duration?.seconds ? parseInt(route.duration.seconds) : 0),
              };
            }
          } catch (err) {
            console.log('[Directions] Route', i, 'erreur API:', err.message);
          }

          // Fallback si l'appel a échoué
          if (!result.coordinates) {
            result.coordinates = [
              { latitude: parseFloat(current.latitude), longitude: parseFloat(current.longitude) },
              { latitude: parseFloat(next.latitude), longitude: parseFloat(next.longitude) },
            ];
          }
          return result;
        }));

        // Traiter les résultats : écraser à l'index correspondant
        let apiSuccessCount = 0;
        for (const { i, coordinates, polylineData } of routeResults) {
          newRoutes[i] = { coordinates, color: ORDER_COLORS[i % ORDER_COLORS.length] };
          if (polylineData) {
            polylinesToSave[i] = polylineData;
            apiSuccessCount++;
          }
        }

        if (apiSuccessCount > 0) {
          console.log('[Directions] ✓', apiSuccessCount, 'routes calculées via API');
        }
        console.log('[Directions] Final:', newRoutes.length, 'routes, à sauvegarder:', Object.keys(polylinesToSave).length);
        // 🎯 Ne jamais écraser les polylines du premier useEffect sauf si refresh explicite ou flag changé ou override actif
        const hasAnyChanges = needsRefresh || needsFlagRecalc || hasOverride || hasActiveFlags;
        if (!hasAnyChanges && polylinesRef.current.length > 0) {
          setRoutes(polylinesRef.current);
        } else {
          polylinesRef.current = newRoutes;
          setRoutes(newRoutes);
          // 🔍 Vérifier le point de départ de la route 2 (Lauterbrunnen)
          const r2 = newRoutes[2];
          if (r2?.coordinates?.[0]) {
            console.log('[RoutesRender] ✅ Route 2 (Lauterbrunnen→Aar) premier point: (',
              r2.coordinates[0].latitude.toFixed(4), ',', r2.coordinates[0].longitude.toFixed(4), ') colors:', r2.color);
          }
          console.log('[RoutesRender] ✅ setRoutes appelé avec', newRoutes.length, 'routes');
        }

        // Enrichir les distances dans le cache (pas via setSteps pour éviter overwrite)
        const distancesFromAPI = {};
        for (const [idx, routeData] of Object.entries(polylinesToSave)) {
          const stepIdx = parseInt(idx);
          if (stepIdx + 1 < steps.length) {
            const nextStepId = steps[stepIdx + 1].id;
            distancesFromAPI[nextStepId] = {
              distance: Math.round(routeData.distance / 1000),
              duration: Math.round(routeData.duration / 60),
            };
          }
        }

        // 🎯 Mettre à jour le cache des distances au lieu de setSteps
        if (Object.keys(distancesFromAPI).length > 0) {
          console.log('[Directions] Mise à jour cache distances:', Object.keys(distancesFromAPI).length, 'steps');
          distancesMapRef.current = { ...distancesMapRef.current, ...distancesFromAPI };
          setDistancesVersion(v => v + 1);  // 🎯 Trigger re-render avec les nouvelles distances
        }

        // Étape 3: Sauvegarder les polylines + distances + durations en BD (via PATCH pour éviter upsert)
        if (Object.keys(polylinesToSave).length > 0) {
          const token = useAuthStore.getState().token;
          let savedCount = 0;
          for (const [idx, routeData] of Object.entries(polylinesToSave)) {
            const stepIdx = parseInt(idx);
            if (stepIdx >= steps.length) {
              console.log('[Directions] Index hors limites:', stepIdx, '/', steps.length);
              continue;
            }
            const step = steps[stepIdx];
            const stepId = step.id;
            console.log('[Directions] Save route', stepIdx,
              `(${Math.round(routeData.distance / 1000)}km)`);
            try {
              const response = await fetch(`${API_URL}/api/steps/${stepId}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  routeEncodedPolyline: routeData.polyline,
                  routeDistanceMeters: routeData.distance,
                  routeDurationSeconds: routeData.duration,
                }),
              });
              if (response.ok) {
                savedCount++;
              } else {
                const errText = await response.text();
                console.log('[Directions] ✗ Erreur save step', stepId, response.status, errText);
              }
            } catch (err) {
              console.log('[Directions] Erreur save route:', err.message);
            }
          }
          console.log('[Directions] ✓', savedCount, 'routes sauvegardées');
        }
      } catch (err) {
        console.error('[Directions] Erreur:', err);
      }

      // 🎯 Marker que le calcul des directions est terminé
      lastDepArrKeyRef.current = psDepArrKey;
      directionsCalculatedRef.current = true;
      // Nettoyer les overrides confirmés par PowerSync (après le calcul, pas avant)
      const confirmedOverrides = { ..._depArrOverride.current };
      for (const itemId of Object.keys(confirmedOverrides)) {
        const item = psAccommodations.find(a => a.id === itemId) || psActivities.find(a => a.id === itemId);
        if (item && !!item.isDeparture === !!confirmedOverrides[itemId].isDeparture && !!item.isArrival === !!confirmedOverrides[itemId].isArrival) {
          delete _depArrOverride.current[itemId];
        }
      }
      // Forcer le re-render natif des Polyline react-native-maps
      setRoutesVersion(v => v + 1);
    };

    loadRoutes();
  }, [stepsLength, refreshCounter, psDepArrKey]);

  // Injecter titre + hamburger dans la barre de navigation native
  React.useLayoutEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    console.log('[Places] API Key:', apiKey ? `CHARGÉE (${apiKey.slice(0, 8)}...)` : 'NON TROUVÉE');
    navigation.setOptions({
      headerShown: true,
      headerTitle: roadtrip.title,
      headerTitleAlign: 'center',
      headerTitleStyle: { color: '#fff', fontSize: 18, fontWeight: '700' },
      headerStyle: { backgroundColor: 'rgba(26,26,38,1)' },
      headerTintColor: '#fff',
      headerRight: () => (
        <TouchableOpacity style={{ marginRight: 12 }} onPress={() => setMenuVisible(true)}>
          <Text style={{ fontSize: 18, color: '#fff' }}>☰</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, roadtrip.title]);

  // Calculer la région qui englobe une étape et tous ses items (hébergements + activités)
  // Récupérer les coordonnées d'une étape et tous ses items (pour fitToCoordinates)
  const getStepCoordinates = useCallback((step, accomList, activityList) => {
    if (!step) return [];

    const coords = [];

    if (step.latitude && step.longitude) {
      coords.push({
        latitude: parseFloat(step.latitude),
        longitude: parseFloat(step.longitude),
      });
    }

    accomList
      .filter(a => a.stepId === step.id && a.latitude && a.longitude)
      .forEach(a => {
        coords.push({
          latitude: parseFloat(a.latitude),
          longitude: parseFloat(a.longitude),
        });
      });

    activityList
      .filter(a => a.stepId === step.id && a.latitude && a.longitude)
      .forEach(a => {
        coords.push({
          latitude: parseFloat(a.latitude),
          longitude: parseFloat(a.longitude),
        });
      });

    return coords;
  }, []);

  // Calculer une région centrée sur le marqueur de l'étape avec un zoom adapté à ses items
  const getStepRegion = useCallback((step, accomList, activityList) => {
    if (!step) return null;

    const stepLat = parseFloat(step.latitude);
    const stepLng = parseFloat(step.longitude);

    if (isNaN(stepLat) || isNaN(stepLng)) return null;

    // Ratio de décalage nord pour compenser le volet fermé en bas (~200px sur ~750px d'écran)
    const SHEET_OFFSET_RATIO = 0.14;

    // Collecter toutes les coordonnées (étape + items)
    const allCoords = [{ latitude: stepLat, longitude: stepLng }];

    accomList
      .filter(a => a.stepId === step.id && a.latitude && a.longitude)
      .forEach(a => {
        allCoords.push({ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) });
      });

    activityList
      .filter(a => a.stepId === step.id && a.latitude && a.longitude)
      .forEach(a => {
        allCoords.push({ latitude: parseFloat(a.latitude), longitude: parseFloat(a.longitude) });
      });

    if (allCoords.length === 1) {
      // Aucun item avec coordonnées → zoom par défaut sur l'étape
      return {
        latitude: stepLat - 0.05 * SHEET_OFFSET_RATIO,
        longitude: stepLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    // Calculer la distance max d'un item par rapport à l'étape
    // (contrairement à min/max, ça garantit que tous les items restent dans le viewport
    //  même si l'étape est à une extrémité du groupe)
    let maxLatDiff = 0;
    let maxLngDiff = 0;

    allCoords.forEach(c => {
      const latDiff = Math.abs(c.latitude - stepLat);
      const lngDiff = Math.abs(c.longitude - stepLng);
      if (latDiff > maxLatDiff) maxLatDiff = latDiff;
      if (lngDiff > maxLngDiff) maxLngDiff = lngDiff;
    });

    // Deltas : 2× la distance max (pour couvrir des deux côtés de l'étape) + padding
    const PADDING_FACTOR = 1.5;
    const MIN_DELTA = 0.008;
    const latDelta = Math.max(maxLatDiff * 2 * PADDING_FACTOR, MIN_DELTA);
    const lngDelta = Math.max(maxLngDiff * 2 * PADDING_FACTOR, MIN_DELTA);

    // Décaler le centre vers le nord pour que les marqueurs ne soient pas masqués par le volet
    const latitude = stepLat - latDelta * SHEET_OFFSET_RATIO;

    // La région est centrée sur le marqueur de l'étape, avec un décalage nord pour le volet
    return {
      latitude,
      longitude: stepLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, []);

  // Récupérer les coordonnées de tout le roadtrip (pour fitToCoordinates)
  const getRoadtripCoordinates = useCallback((stepList, accomList, activityList) => {
    const coords = [];

    stepList.forEach(step => {
      if (step.latitude && step.longitude) {
        coords.push({
          latitude: parseFloat(step.latitude),
          longitude: parseFloat(step.longitude),
        });
      }
    });

    accomList.forEach(a => {
      if (a.latitude && a.longitude) {
        coords.push({
          latitude: parseFloat(a.latitude),
          longitude: parseFloat(a.longitude),
        });
      }
    });

    activityList.forEach(a => {
      if (a.latitude && a.longitude) {
        coords.push({
          latitude: parseFloat(a.latitude),
          longitude: parseFloat(a.longitude),
        });
      }
    });

    return coords;
  }, []);

  const openDetail = useCallback((index) => {
    setSelectedIndex(index);

    // Zoomer pour englober tous les items de l'étape (avec padding)
    if (steps[index] && mapRef.current) {
      const coords = getStepCoordinates(steps[index], psAccommodations, psActivities);
      if (coords.length > 0) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 30, bottom: 60, left: 30 },
          animated: true,
        });
      }
    }
  }, [steps, psAccommodations, psActivities, getStepCoordinates]);

  const openEditStep = useCallback((index) => {
    const step = steps[index];
    if (!step) return;
    navigation.navigate('EditStep', { step });
  }, [navigation, steps]);

  // ─── Recherche par catégorie (clic bouton) ─────────────────────────────────
  const handleCategoryPress = useCallback(async (cat) => {
    const isActive = activeOverlays[cat.key];

    if (isActive) {
      // Désactiver : masquer les résultats
      setActiveOverlays(prev => ({ ...prev, [cat.key]: false }));
      return;
    }

    // Activer : lancer la recherche
    setActiveOverlays(prev => ({ ...prev, [cat.key]: true }));
    setCategoryLoading(prev => ({ ...prev, [cat.key]: true }));

    try {
      const bounds = await mapRef.current?.getMapBoundaries();
      if (!bounds) {
        setActiveOverlays(prev => ({ ...prev, [cat.key]: false }));
        setCategoryLoading(prev => ({ ...prev, [cat.key]: false }));
        return;
      }

      const rawBounds = {
        ne: { lat: bounds.northEast.latitude, lng: bounds.northEast.longitude },
        sw: { lat: bounds.southWest.latitude, lng: bounds.southWest.longitude },
      };
      const visibleBounds = adjustBoundsForSheet(rawBounds);
      setSearchBounds(visibleBounds);

      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/places/searchCategory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          bounds: visibleBounds,
          category: cat.key,
          includedTypes: cat.googleTypes,
          includeP4N: cat.includeP4N,
          p4nTypeIds: cat.p4nTypes,
          maxResults: 20,
          language: 'fr',
          ...(cat.key === 'trails' && {
            trailMinKm: effectiveTrailFilter.min,
            trailMaxKm: effectiveTrailFilter.max,
          }),
        }),
      });
      const data = await res.json();
      console.log(`[ZoneSearch] ✓ ${cat.key}: ${data.results?.length || 0} résultats`);

      setCategoryResults(prev => ({ ...prev, [cat.key]: data.results || [] }));
    } catch (err) {
      console.error(`[ZoneSearch] ✗ ${cat.key}:`, err.message);
      setCategoryResults(prev => ({ ...prev, [cat.key]: [] }));
    } finally {
      setCategoryLoading(prev => ({ ...prev, [cat.key]: false }));
    }
  }, [activeOverlays]);

  // Mapping des types Google Places vers nos enums AccomType / ActivityType
  const mapGoogleTypesToAccomType = (types = []) => {
    if (types.includes('campground') || types.includes('rv_park')) return 'CAMPING';
    if (types.includes('parking')) return 'PARKING';
    if (types.includes('lodging') || types.includes('hotel') || types.includes('motel') || types.includes('resort_hotel') || types.includes('guest_house') || types.includes('bed_and_breakfast')) return 'HOTEL';
    return 'OTHER';
  };

  const mapGoogleTypesToActivityType = (types = []) => {
    if (types.some(t => ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery'].includes(t))) return 'RESTAURANT';
    if (types.some(t => ['supermarket', 'grocery_or_supermarket', 'convenience_store'].includes(t))) return 'SUPERMARKET';
    if (types.some(t => ['hiking_area', 'park', 'natural_feature', 'national_park'].includes(t))) return 'HIKING';
    if (types.some(t => ['gas_station', 'car_rental', 'airport', 'train_station', 'bus_station', 'transit_station', 'subway_station'].includes(t))) return 'TRANSPORT';
    if (types.some(t => ['tourist_attraction', 'museum', 'amusement_park', 'zoo', 'point_of_interest', 'establishment'].includes(t))) return 'ACTIVITY';
    return 'OTHER';
  };

  // Recherche Google Places avec throttle
  const searchPlaces = useCallback(async (query) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('[Places] Searching for:', query);
        const token = useAuthStore.getState().token;
        const response = await fetch(`${API_URL}/api/places/autocomplete?input=${encodeURIComponent(query)}&language=fr`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        console.log('[Places] Response type:', typeof data, Array.isArray(data) ? 'array' : 'object', 'length:', data?.length);
        const predictions = Array.isArray(data) ? data : data.predictions || [];
        console.log('[Places] Predictions count:', predictions.length);
        if (predictions.length > 0) {
          console.log('[Places] First prediction:', JSON.stringify(predictions[0]).slice(0, 300));
        }

        // Parser la structure predictions Google Autocomplete
        const formatted = predictions.map(p => ({
          description: p.description || p.mainText || '',
          placeId: p.place_id,
          mainText: p.main_text || '',
          secondaryText: p.secondary_text || '',
          types: p.types || [],
        })).slice(0, 8);

        console.log('[Places] Formatted suggestions:', formatted);
        setSuggestions(formatted);
      } catch (err) {
        console.error('[Places Search] Error:', err);
        setSuggestions([]);
      }
    }, 300);
  }, []);

  const region = computeRegion(steps);
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;
  const color = selectedIndex >= 0 ? ORDER_COLORS[selectedIndex % ORDER_COLORS.length] : '#8b5cf6';

  // Rôle de l'utilisateur sur ce roadtrip
  const { role: userRole, isOwner, canEdit } = useRoadtripRole(id);

  // Calculer le nombre total de jours du roadtrip
  const totalDays = useMemo(() => {
    if (!steps.length) return 0;
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    if (!firstStep?.startDate || !lastStep?.endDate) return 0;
    return durationDays(firstStep.startDate, lastStep.endDate);
  }, [steps]);

  try {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* ─── SEARCH + CATEGORIES (sous la nav native) ──────────────────── */}
        <View style={styles.headerContainer}>
          {/* Search bar */}
          <View style={styles.searchArea}>
            <View style={styles.searchBar}>
              <TextInput
                ref={searchInputRef}
                placeholder="Rechercher un lieu…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (text.length > 2) {
                    searchPlaces(text);
                  } else {
                    setSuggestions([]);
                  }
                }}
                style={styles.textInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSuggestions([]); }}>
                  <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category buttons bar (horizontal scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catBar}
            contentContainerStyle={styles.catBarContent}
          >
            {categoryButtons.map(cat => {
              const isActive = activeOverlays[cat.key];
              const isLoading = categoryLoading[cat.key];
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => handleCategoryPress(cat)}
                  style={[styles.catBtn, isActive && styles.catBtnActive]}
                  activeOpacity={0.7}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#93c5fd" style={{ marginRight: 4 }} />
                  ) : (
                    <Text style={styles.catBtnIcon}>{cat.icon}</Text>
                  )}
                  <Text style={[styles.catBtnLabel, isActive && styles.catBtnLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Dropdown suggestions */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsDropdown}>
              <ScrollView scrollEnabled={suggestions.length > 5} style={{ maxHeight: 280 }}>
                {suggestions.map((place, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={async () => {
                      try {
                        const token = useAuthStore.getState().token;
                        const detailsResponse = await fetch(
                          `${API_URL}/api/places/${encodeURIComponent(place.placeId)}?language=fr`,
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                        const details = await detailsResponse.json();
                        const lat = details.lat;
                        const lng = details.lng;
                        if (lat != null && lng != null) {
                          setSearchResultMarker({
                            latitude: lat,
                            longitude: lng,
                            title: place.mainText,
                            description: place.secondaryText || place.description,
                            types: (details.types && details.types.length > 0) ? details.types : (place.types || []),
                            fullPlace: place,
                          });
                          if (mapRef.current) {
                            mapRef.current.animateToRegion({
                              latitude: lat, longitude: lng,
                              latitudeDelta: 0.05, longitudeDelta: 0.05,
                            }, 500);
                          }
                        }
                      } catch (err) {
                        console.error('[Places] Error fetching details:', err);
                      }
                      setSearchQuery('');
                      setSuggestions([]);
                    }}
                    style={styles.suggestionRow}
                  >
                    <Text style={styles.suggestionMainText} numberOfLines={1}>{place.mainText}</Text>
                    <Text style={styles.suggestionSubText} numberOfLines={1}>{place.secondaryText}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ─── MAP (flex: 1 to fill remaining space) ───────────────────────── */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={[StyleSheet.absoluteFill, { bottom: CAROUSEL_BOTTOM + 30 }]}
            initialRegion={region}
            provider={PROVIDER_GOOGLE}
            mapType={mapType}
            onPoiClick={(e) => {
              const { coordinate, name, placeId } = e.nativeEvent;
              setSearchResultMarker({
                title: name,
                description: name,
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                placeId,
              });
              setShowSearchResultModal(true);
            }}
          >
            {/* Afficher les itinéraires */}
            {routes.map((route, idx) => {
              const first = route.coordinates[0];
              const last = route.coordinates[route.coordinates.length - 1];
              return (
                <Polyline
                  key={`r-${routesVersion}-${idx}`}
                  coordinates={route.coordinates}
                  strokeColor={route.color}
                  strokeWidth={4}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            })}

            {/* Afficher les marqueurs */}
            {steps.map((s, i) => {
              if (!s.latitude || !s.longitude) {
                return null;
              }
              return (
                <Marker
                  key={s.id}
                  coordinate={{ latitude: parseFloat(s.latitude), longitude: parseFloat(s.longitude) }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => openDetail(i)}
                >
                  <View style={[styles.marker, { backgroundColor: ORDER_COLORS[i % ORDER_COLORS.length] }]}>
                    <Text style={styles.markerText}>{i + 1}</Text>
                  </View>
                </Marker>
              );
            })}

            {/* Marqueurs pour les hébergements — masqués en vue globale */}
            {selectedIndex >= 0 && psAccommodations
              .filter(a => a.latitude && a.longitude)
              .map(accom => (
                <Marker
                  key={`accom-${accom.id}`}
                  coordinate={{ latitude: parseFloat(accom.latitude), longitude: parseFloat(accom.longitude) }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => {
                    setMenuMarker({ item: accom, type: 'accommodation', stepId: accom.stepId });
                    setShowMarkerMenu(true);
                  }}
                >
                  <View style={styles.accomMarker}>
                    <Text style={styles.accomMarkerText}>
                      {ACCOM_ICONS[accom.type] || ACCOM_ICONS.OTHER}
                    </Text>
                  </View>
                </Marker>
              ))}

            {/* Marqueurs pour les activités — masqués en vue globale */}
            {selectedIndex >= 0 && psActivities
              .filter(a => a.latitude && a.longitude)
              .map(activity => (
                <Marker
                  key={`activity-${activity.id}`}
                  coordinate={{ latitude: parseFloat(activity.latitude), longitude: parseFloat(activity.longitude) }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => {
                    setMenuMarker({ item: activity, type: 'activity', stepId: activity.stepId });
                    setShowMarkerMenu(true);
                  }}
                >
                  <View style={styles.activityMarker}>
                    <Text style={styles.activityMarkerText}>
                      {ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.OTHER}
                    </Text>
                  </View>
                </Marker>
              ))}

            {/* Marqueurs Parking — reliés en pointillé à leur activité */}
            {selectedIndex >= 0 && psActivities
              .filter(a => a.parkingAddress)
              .map(activity => {
                const hasActCoords = activity.latitude && activity.longitude;
                const hasParkCoords = activity.parkingLatitude && activity.parkingLongitude;
                const parkLat = hasParkCoords ? activity.parkingLatitude : (hasActCoords ? parseFloat(activity.latitude) + 0.001 : 0);
                const parkLng = hasParkCoords ? activity.parkingLongitude : (hasActCoords ? parseFloat(activity.longitude) + 0.001 : 0);
                return (
                  <React.Fragment key={`parking-${activity.id}`}>
                    {hasParkCoords && hasActCoords && (
                      <Polyline
                        coordinates={[
                          { latitude: parkLat, longitude: parkLng },
                          { latitude: parseFloat(activity.latitude), longitude: parseFloat(activity.longitude) },
                        ]}
                        strokeColor="rgba(96,165,250,0.5)"
                        strokeWidth={2}
                        lineDashPattern={[4, 6]}
                      />
                    )}
                    {parkLat !== 0 && parkLng !== 0 && (
                      <Marker
                        coordinate={{ latitude: parkLat, longitude: parkLng }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.parkingMarker}>
                          <Text style={styles.parkingMarkerText}>🅿️</Text>
                        </View>
                      </Marker>
                    )}
                  </React.Fragment>
                );
              })}

            {/* Marqueurs de résultats par catégorie */}
            {Object.entries(categoryResults).map(([catKey, results]) => {
              const catDef = categoryButtons.find(c => c.key === catKey);
              const catIcon = catDef?.icon || '📍';
              return activeOverlays[catKey] && results.map((place, idx) => {
                // Icône différente pour AllTrails (🌲) vs Google Places (🥾)
                const markerIcon = (catKey === 'trails' && place.source === 'algolia') ? '🌲' : catIcon;
                // Tronquer le nom si trop long
                const labelName = place.name?.length > 22 ? place.name.slice(0, 20) + '…' : place.name;
                return (
                  <Marker
                    key={`zr-${catKey}-${place.id}-${idx}`}
                    coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                    anchor={{ x: 0, y: 0.5 }}
                    onPress={() => {
                      setMenuMarker({ item: place, type: 'poi', stepId: null });
                      setShowMarkerMenu(true);
                    }}
                  >
                    <View style={styles.catResultMarkerRow}>
                      <View style={[
                        styles.catResultMarker,
                        {
                          backgroundColor: catKey === 'p4n' ? 'rgba(99,102,241,0.9)' :
                            catKey === 'campings' ? 'rgba(249,115,22,0.9)' :
                              catKey === 'trails' ? 'rgba(34,197,94,0.9)' :
                                catKey === 'pois' ? 'rgba(139,92,246,0.9)' :
                                  catKey === 'restaurant' ? 'rgba(236,72,153,0.9)' :
                                    catKey === 'hotel' ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.9)'
                        },
                      ]}>
                        <Text style={styles.catResultMarkerText}>{markerIcon}</Text>
                      </View>
                      <View style={styles.catResultLabelBox}>
                        <Text style={styles.catResultLabel} numberOfLines={1}>{labelName}</Text>
                      </View>
                    </View>
                  </Marker>
                );
              });
            })}

            {/* Marqueur de résultat de recherche */}
            {searchResultMarker && (
              <Marker
                key="search-result"
                coordinate={{ latitude: searchResultMarker.latitude, longitude: searchResultMarker.longitude }}
                anchor={{ x: 0.5, y: 1 }}
                onPress={() => setShowSearchResultModal(true)}
              >
                <View style={styles.searchResultMarker}>
                  <Text style={styles.searchResultMarkerText}>📍</Text>
                </View>
              </Marker>
            )}
          </MapView>

          {/* ─── OVERLAY BUTTONS (absolute within map) — zoom + global ── */}
          <View style={[styles.overlayCol, { top: 12 }]}>
            {/* Bouton zoom sur l'étape sélectionnée */}
            {selectedIndex >= 0 && (
              <TouchableOpacity
                key="zoom-step"
                onPress={() => {
                  const step = steps[selectedIndex];
                  if (!step || !mapRef.current) return;
                  const coords = getStepCoordinates(step, psAccommodations, psActivities);
                  if (coords.length > 0) {
                    mapRef.current.fitToCoordinates(coords, {
                      edgePadding: { top: 60, right: 30, bottom: 60, left: 30 },
                      animated: true,
                    });
                  }
                }}
                style={[styles.ovBtn, { backgroundColor: 'rgba(59,130,246,0.25)', borderColor: 'rgba(59,130,246,0.4)' }]}
              >
                <Text style={styles.ovBtnIcon}>🔍</Text>
              </TouchableOpacity>
            )}

            {/* Bouton vue globale — visible seulement quand une étape est sélectionnée */}
            {selectedIndex >= 0 && (
              <TouchableOpacity
                key="global-view"
                onPress={() => {
                  setSelectedIndex(-1);
                  const coords = getRoadtripCoordinates(steps, psAccommodations, psActivities);
                  if (coords.length > 0 && mapRef.current) {
                    mapRef.current.fitToCoordinates(coords, {
                      edgePadding: {
                        top: 80,
                        right: 40,
                        bottom: CAROUSEL_BOTTOM + 20,
                        left: 40,
                      },
                      animated: true,
                    });
                  }
                }}
                style={[styles.ovBtn, styles.ovBtnGlobal]}
              >
                <Text style={styles.ovBtnIcon}>🗺️</Text>
              </TouchableOpacity>
            )}

            {/* Toggle satellite — toujours visible */}
            <TouchableOpacity
              key="satellite-toggle"
              onPress={() => setMapType(prev => prev === 'satellite' ? 'standard' : 'satellite')}
              style={[
                styles.ovBtn,
                mapType === 'satellite' && {
                  backgroundColor: 'rgba(34,197,94,0.25)',
                  borderColor: 'rgba(34,197,94,0.4)',
                },
              ]}
            >
              <Text style={styles.ovBtnIcon}>
                {mapType === 'satellite' ? '🗺️' : '🛰️'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* ─── CARROUSEL HORIZONTAL (permanent) ────────────────────────── */}
        <StepCarousel
          steps={steps}
          selectedIndex={selectedIndex}
          onEditStep={(index) => openEditStep(index)}
          onScrollIndexChange={(index) => {
            setSelectedIndex(index);
            if (steps[index] && mapRef.current) {
              const coords = getStepCoordinates(steps[index], psAccommodations, psActivities);
              if (coords.length > 0) {
                mapRef.current.fitToCoordinates(coords, {
                  edgePadding: { top: 60, right: 30, bottom: 60, left: 30 },
                  animated: true,
                });
              }
            }
          }}
        />

        {/* ─── SEARCH RESULT MODAL ──────────────────────────────────────────── */}
        {showSearchResultModal && searchResultMarker && (
          <View style={styles.searchResultModalOverlay}>
            <View style={styles.searchResultModalContent}>
              <View style={styles.searchResultHeader}>
                <Text style={styles.searchResultTitle}>{searchResultMarker.title}</Text>
                <TouchableOpacity onPress={() => {
                  setShowSearchResultModal(false);
                }}>
                  <Text style={styles.searchResultClose}>✕</Text>
                </TouchableOpacity>
              </View>
              {searchResultMarker.description && (
                <Text style={styles.searchResultSubtitle}>{searchResultMarker.description}</Text>
              )}
              <View style={styles.searchResultDivider} />
              <Text style={styles.markerActionSectionTitle}>Ajouter en tant que</Text>
              <View style={styles.markerActionGrid}>
                <MarkerAction icon="📍" label="Étape" color="#f59e0b" bg="rgba(245,158,11,0.15)"
                  onPress={async () => {
                    await useRoadtripStore.getState().createStep({
                      roadtripId: roadtrip.id, name: searchResultMarker.title,
                      location: searchResultMarker.description,
                      latitude: searchResultMarker.latitude, longitude: searchResultMarker.longitude,
                      order: steps.length,
                    });
                    setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery('');
                  }} />
                <MarkerAction icon="🏨" label="Hébergement" color="#3b82f6" bg="rgba(59,130,246,0.15)"
                  onPress={async () => {
                    const cs = steps[selectedIndex];
                    if (!cs) { Alert.alert('Aucune étape sélectionnée', ''); return; }
                    const dt = cs.arrivalTime || '10:00';
                    try {
                      await useRoadtripStore.getState().createAccommodation({
                        stepId: cs.id, roadtripId: roadtrip.id, name: searchResultMarker.title,
                        address: searchResultMarker.description,
                        latitude: searchResultMarker.latitude, longitude: searchResultMarker.longitude,
                        type: mapGoogleTypesToAccomType(searchResultMarker.types),
                        checkIn: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                        checkOut: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                      });
                      setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery('');
                    } catch (err) { Alert.alert('Erreur', 'Impossible d\'ajouter.'); }
                  }} />
                <MarkerAction icon="🎯" label="Activité" color="#22c55e" bg="rgba(34,197,94,0.15)"
                  onPress={async () => {
                    const cs = steps[selectedIndex];
                    if (!cs) { Alert.alert('Aucune étape sélectionnée', ''); return; }
                    const dt = cs.arrivalTime || '10:00';
                    try {
                      await useRoadtripStore.getState().createActivity({
                        stepId: cs.id, roadtripId: roadtrip.id, name: searchResultMarker.title,
                        location: searchResultMarker.description,
                        latitude: searchResultMarker.latitude, longitude: searchResultMarker.longitude,
                        type: mapGoogleTypesToActivityType(searchResultMarker.types),
                        startTime: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                        endTime: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                      });
                      setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery('');
                    } catch (err) { Alert.alert('Erreur', 'Impossible d\'ajouter.'); }
                  }} />
                <MarkerAction icon="🅿️" label="Parking" color="#60a5fa" bg="rgba(96,165,250,0.2)"
                  onPress={async () => {
                    const cs = steps[selectedIndex];
                    if (!cs) { Alert.alert('Aucune étape sélectionnée', 'Sélectionne d\'abord une étape.'); return; }
                    const stepActivities = psActivities.filter(a => a.stepId === cs.id);
                    if (stepActivities.length === 0) {
                      Alert.alert('Aucune activité', 'Crée d\'abord une activité dans cette étape.'); return;
                    }
                    const parkingStr = searchResultMarker.description || searchResultMarker.title;
                    const parkingData = {
                      parkingAddress: parkingStr,
                      parkingLatitude: searchResultMarker.latitude ?? null,
                      parkingLongitude: searchResultMarker.longitude ?? null,
                    };
                    if (stepActivities.length === 1) {
                      await localUpdateActivity(stepActivities[0].id, parkingData);
                      setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery('');
                    } else {
                      Alert.alert('Associer à quelle activité ?', null,
                        stepActivities.map(act => ({
                          text: act.name,
                          onPress: async () => {
                            await localUpdateActivity(act.id, parkingData);
                            setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery('');
                          },
                        })).concat({ text: 'Annuler', style: 'cancel' })
                      );
                    }
                  }} />
              </View>
              <View style={styles.searchResultDivider} />
              <TouchableOpacity style={styles.searchResultAction}
                onPress={() => { setShowSearchResultModal(false); setSearchResultMarker(null); setSearchQuery(''); }}
              >
                <Text style={styles.searchResultActionIcon}>✕</Text>
                <Text style={[styles.searchResultActionText, { color: 'rgba(255,255,255,0.4)' }]}>Supprimer le marqueur</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── MENU CONTEXTUEL MARQUEUR ────────────────────────────────── */}
        {showMarkerMenu && menuMarker && (
          <Pressable style={styles.markerOverlay} onPress={() => setShowMarkerMenu(false)}>
            <Pressable style={styles.searchResultModalContent}>
              {/* Header */}
              <View style={styles.markerMenuHeader}>
                <Text style={styles.markerMenuTitle} numberOfLines={2}>{menuMarker.item.name}</Text>
                <TouchableOpacity onPress={() => setShowMarkerMenu(false)} style={styles.markerMenuClose}>
                  <Text style={styles.markerMenuCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.markerMenuBadge}>
                {menuMarker.type === 'accommodation' ? '🏨 Hébergement' : menuMarker.type === 'activity' ? '🎯 Activité' : '📍 Point d\'intérêt'}
                {menuMarker.stepId ? ` · Étape ${steps.findIndex(s => s.id === menuMarker.stepId) + 1}` : ''}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 400 }}>
              {/* ── INFOS + PHOTO ── */}
              {/* AllTrails stats */}
              {menuMarker.item.source === 'algolia' && menuMarker.item.lengthKm && (
                <View style={styles.markerInfoRow}>
                  <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>🥾 {menuMarker.item.lengthKm}km</Text></View>
                  {menuMarker.item.elevationGain ? <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>⛰️ {menuMarker.item.elevationGain}m</Text></View> : null}
                  {menuMarker.item.avgRating ? <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>⭐ {menuMarker.item.avgRating}/5</Text></View> : null}
                  {menuMarker.item.durationMinutes ? <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>⏱️ {(menuMarker.item.durationMinutes || 0) >= 60 ? `${Math.floor((menuMarker.item.durationMinutes || 0) / 60)}h${(menuMarker.item.durationMinutes || 0) % 60}` : `${menuMarker.item.durationMinutes || 0}min`}</Text></View> : null}
                </View>
              )}

              {/* Photo Google Places */}
              {menuMarker.item.source === 'google' && menuMarker.item.photoName && (
                <View style={styles.markerPhotoContainer}>
                  <Image
                    source={{ uri: `${API_URL}/api/places/photo?photoName=${encodeURIComponent(menuMarker.item.photoName)}` }}
                    style={styles.poiPhoto}
                    resizeMode="cover"
                  />
                </View>
              )}

              {/* Rating Google */}
              {menuMarker.item.source === 'google' && (menuMarker.item.rating || menuMarker.item.userRatingCount) && (
                <View style={styles.markerInfoRow}>
                  {menuMarker.item.rating && (
                    <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>{'⭐'.repeat(Math.round(menuMarker.item.rating))}{'☆'.repeat(5 - Math.round(menuMarker.item.rating))} {menuMarker.item.rating}/5</Text></View>
                  )}
                  {menuMarker.item.userRatingCount ? (
                    <View style={styles.markerInfoChip}><Text style={styles.markerInfoChipText}>👤 {menuMarker.item.userRatingCount} avis</Text></View>
                  ) : null}
                </View>
              )}

              {/* ── GRILLE D'ACTIONS ── */}
              {/* Liens externes (POI) */}
              {menuMarker.type === 'poi' && (
                <>
                  <View style={styles.markerActionGrid}>
                    {menuMarker.item.source === 'algolia' && menuMarker.item.alltrailsUrl && (
                      <MarkerAction icon="🌲" label="AllTrails" color="#4ade80" bg="rgba(34,197,94,0.15)"
                        onPress={() => { Linking.openURL(menuMarker.item.alltrailsUrl); setShowMarkerMenu(false); }} />
                    )}
                    {menuMarker.item.source === 'google' && menuMarker.item.googleMapsUrl && (
                      <MarkerAction icon="🗺️" label="Google Maps" color="#60a5fa" bg="rgba(59,130,246,0.15)"
                        onPress={() => { Linking.openURL(menuMarker.item.googleMapsUrl); setShowMarkerMenu(false); }} />
                    )}
                    {menuMarker.item.source === 'p4n' && menuMarker.item.p4nUrl && (
                      <MarkerAction icon="🚐" label="Park4Night" color="#818cf8" bg="rgba(99,102,241,0.15)"
                        onPress={async () => {
                          const placeId = menuMarker.item.placeId;
                          if (Platform.OS === 'android' && placeId) {
                            try { await Linking.openURL(`intent://fr/place/${placeId}#Intent;scheme=https;package=fr.tramb.park4night;end`); setShowMarkerMenu(false); return; } catch { }
                          }
                          Linking.openURL(menuMarker.item.p4nUrl); setShowMarkerMenu(false);
                        }} />
                    )}
                  </View>

                  <Text style={styles.markerActionSectionTitle}>Ajouter en tant que</Text>
                  <View style={styles.markerActionGrid}>
                    <MarkerAction icon="📍" label="Étape" color="#f59e0b" bg="rgba(245,158,11,0.15)"
                      onPress={async () => {
                        await useRoadtripStore.getState().createStep({
                          roadtripId: roadtrip.id, name: menuMarker.item.name,
                          location: menuMarker.item.address || menuMarker.item.name,
                          latitude: parseFloat(menuMarker.item.latitude), longitude: parseFloat(menuMarker.item.longitude),
                          order: steps.length,
                        });
                        setShowMarkerMenu(false);
                      }} />
                    <MarkerAction icon="🏨" label="Hébergement" color="#3b82f6" bg="rgba(59,130,246,0.15)"
                      onPress={async () => {
                        const cs = steps[selectedIndex];
                        if (!cs) { Alert.alert('Aucune étape sélectionnée', 'Sélectionne d\'abord une étape.'); setShowMarkerMenu(false); return; }
                        const dt = cs.arrivalTime || '10:00';
                        await useRoadtripStore.getState().createAccommodation({
                          stepId: cs.id, roadtripId: id, name: menuMarker.item.name, address: menuMarker.item.name,
                          latitude: parseFloat(menuMarker.item.latitude), longitude: parseFloat(menuMarker.item.longitude),
                          type: 'OTHER', checkIn: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                          checkOut: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                        });
                        setShowMarkerMenu(false);
                      }} />
                    <MarkerAction icon="🎯" label="Activité" color="#22c55e" bg="rgba(34,197,94,0.15)"
                      onPress={async () => {
                        const cs = steps[selectedIndex];
                        if (!cs) { Alert.alert('Aucune étape sélectionnée', 'Sélectionne d\'abord une étape.'); setShowMarkerMenu(false); return; }
                        const dt = cs.arrivalTime || '10:00';
                        await useRoadtripStore.getState().createActivity({
                          stepId: cs.id, roadtripId: id, name: menuMarker.item.name, location: menuMarker.item.name,
                          latitude: parseFloat(menuMarker.item.latitude), longitude: parseFloat(menuMarker.item.longitude),
                          type: 'ACTIVITY', startTime: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                          endTime: cs.startDate ? `${toYMD(cs.startDate)} ${dt}` : null,
                        });
                        setShowMarkerMenu(false);
                      }} />
                    <MarkerAction icon="🅿️" label="Parking" color="#60a5fa" bg="rgba(96,165,250,0.2)"
                      onPress={async () => {
                        const cs = steps[selectedIndex];
                        if (!cs) { Alert.alert('Aucune étape sélectionnée', 'Sélectionne d\'abord une étape.'); setShowMarkerMenu(false); return; }
                        const stepActivities = psActivities.filter(a => a.stepId === cs.id);
                        if (stepActivities.length === 0) {
                          Alert.alert('Aucune activité', 'Crée d\'abord une activité dans cette étape.'); setShowMarkerMenu(false); return;
                        }
                        // L'adresse P4N peut être un objet {street, zipcode, city, country} → la convertir en string
                        const rawAddr = menuMarker.item.address;
                        const parkingStr = typeof rawAddr === 'object' && rawAddr !== null
                          ? [rawAddr.street, rawAddr.zipcode, rawAddr.city, rawAddr.country].filter(Boolean).join(', ')
                          : (rawAddr || menuMarker.item.description || menuMarker.item.name);
                        const itemLat = parseFloat(menuMarker.item.latitude);
                        const itemLng = parseFloat(menuMarker.item.longitude);
                        console.log('[Parking] Sauvegarde parking for activity:', stepActivities[0]?.name, 'parkingStr:', parkingStr, 'lat:', itemLat, 'lng:', itemLng, 'item:', menuMarker.item?.source, menuMarker.item?.id);
                        const parkingData = {
                          parkingAddress: parkingStr,
                          parkingLatitude: isNaN(itemLat) ? null : itemLat,
                          parkingLongitude: isNaN(itemLng) ? null : itemLng,
                        };
                        if (stepActivities.length === 1) {
                          await localUpdateActivity(stepActivities[0].id, parkingData);
                          setShowMarkerMenu(false); setRefreshCounter(c => c + 1);
                        } else {
                          Alert.alert('Associer à quelle activité ?', null,
                            stepActivities.map(act => ({
                              text: act.name,
                              onPress: async () => {
                                await localUpdateActivity(act.id, parkingData);
                                setShowMarkerMenu(false); setRefreshCounter(c => c + 1);
                              },
                            })).concat({ text: 'Annuler', style: 'cancel' })
                          );
                        }
                      }} />
                  </View>
                </>
              )}

              {/* ── MARQUEURS D'ÉTAPES : départ/arrivée ── */}
              {menuMarker.type !== 'poi' && (
                <>
                  <Text style={styles.markerActionSectionTitle}>Point de trajet</Text>
                  <View style={styles.markerActionGrid}>
                    <MarkerAction icon="✎" label="Modifier" color="#93c5fd" bg="rgba(59,130,246,0.5)"
                      onPress={() => {
                        const so = steps.find(s => s.id === menuMarker.stepId);
                        if (so) { setShowMarkerMenu(false); navigation.navigate('EditStep', { step: so, [menuMarker.type === 'accommodation' ? 'initialEditAccommodationId' : 'initialEditActivityId']: menuMarker.item.id }); }
                        else setShowMarkerMenu(false);
                      }} />
                    <MarkerAction icon="🏁" label="Arrivée" color="#f97316" bg="rgba(249,115,22,0.2)"
                      onPress={async () => {
                        const idx = steps.findIndex(s => s.id === menuMarker.stepId);
                        if (idx <= 0) { Alert.alert('Aucune étape précédente', ''); setShowMarkerMenu(false); return; }
                        const id2 = menuMarker.item.id;
                        // Déflaguer les anciens items ET ajouter override mémoire pour éviter
                        // que getStepArrival ne lise des données PowerSync stales
                        for (const a of psAccommodations.filter(a => a.stepId === menuMarker.stepId && a.isArrival && a.id !== id2)) {
                          _depArrOverride.current[a.id] = { ..._depArrOverride.current[a.id], isArrival: false };
                          await localUpdateAccommodation(a.id, { isArrival: false });
                        }
                        const otherActs = psActivities.filter(a => a.stepId === menuMarker.stepId && a.isArrival && a.id !== id2);
                        for (const a of otherActs) {
                          _depArrOverride.current[a.id] = { ..._depArrOverride.current[a.id], isArrival: false };
                          await localUpdateActivity(a.id, { isArrival: false });
                        }
                        const fn = menuMarker.type === 'accommodation' ? localUpdateAccommodation : localUpdateActivity;
                        _depArrOverride.current[id2] = { ..._depArrOverride.current[id2], isArrival: true };
                        await fn(id2, { isArrival: true }); setShowMarkerMenu(false); setRefreshCounter(c => c + 1);
                      }} />
                    <MarkerAction icon="🚀" label="Départ" color="#4ade80" bg="rgba(34,197,94,0.2)"
                      onPress={async () => {
                        const idx = steps.findIndex(s => s.id === menuMarker.stepId);
                        if (idx < 0 || idx >= steps.length - 1) { Alert.alert('Aucune étape suivante', ''); setShowMarkerMenu(false); return; }
                        const id2 = menuMarker.item.id;
                        // Déflaguer les anciens items ET ajouter override mémoire pour éviter
                        // que getStepDeparture ne lise des données PowerSync stales
                        for (const a of psAccommodations.filter(a => a.stepId === menuMarker.stepId && a.isDeparture && a.id !== id2)) {
                          _depArrOverride.current[a.id] = { ..._depArrOverride.current[a.id], isDeparture: false };
                          await localUpdateAccommodation(a.id, { isDeparture: false });
                        }
                        const otherActs = psActivities.filter(a => a.stepId === menuMarker.stepId && a.isDeparture && a.id !== id2);
                        for (const a of otherActs) {
                          _depArrOverride.current[a.id] = { ..._depArrOverride.current[a.id], isDeparture: false };
                          await localUpdateActivity(a.id, { isDeparture: false });
                        }
                        const fn = menuMarker.type === 'accommodation' ? localUpdateAccommodation : localUpdateActivity;
                        _depArrOverride.current[id2] = { ..._depArrOverride.current[id2], isDeparture: true };
                        await fn(id2, { isDeparture: true }); setShowMarkerMenu(false); setRefreshCounter(c => c + 1);
                      }} />
                  </View>
                </>
              )}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        {/* ─── STEP DETAIL MODAL ─────────────────────────────────────────── */}
        <Modal
          visible={showDetail}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowDetail(false)}
        >
          {selectedStep && <StepDetailModal
            step={selectedStep}
            index={selectedIndex}
            color={color}
            onClose={() => setShowDetail(false)}
            onNext={() => {
              const next = Math.min(selectedIndex + 1, steps.length - 1);
              setSelectedIndex(next);
            }}
          />}
        </Modal>

        {/* LogsViewer Modal */}
        <LogsViewer visible={showLogs} onClose={() => setShowLogs(false)} />

        {/* ─── MENU HAMBURGER ──────────────────────────────────────────── */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setMenuVisible(false)}
          >
            <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {/* Handle */}
              <View style={styles.menuHandle} />

              <Text style={styles.menuTitle}>{roadtrip.title}</Text>



              {/* Todo list */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate('TodoList', { roadtripId: id, roadtripTitle: roadtrip?.title });
                }}
              >
                <Text style={styles.menuItemIcon}>✅</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>Todo list</Text>
                  <Text style={styles.menuItemDesc}>Gérer les tâches du roadtrip</Text>
                </View>
              </TouchableOpacity>

              {/* Roadbook */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate('Roadbook', { roadtripId: id, roadtripTitle: roadtrip?.title });
                }}
              >
                <Text style={styles.menuItemIcon}>📖</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>Roadbook</Text>
                  <Text style={styles.menuItemDesc}>Générer et consulter les roadbooks PDF</Text>
                </View>
              </TouchableOpacity>

              {/* Infos générales */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate('RoadtripGeneralInfo', { roadtripId: id });
                }}
              >
                <Text style={styles.menuItemIcon}>📋</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>Infos générales</Text>
                  <Text style={styles.menuItemDesc}>Modifier le titre, les dates, le statut</Text>
                </View>
              </TouchableOpacity>

              {/* Partager — uniquement pour le propriétaire */}
              {isOwner && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    navigation.navigate('Collaborators', { roadtripId: id });
                  }}
                >
                  <Text style={styles.menuItemIcon}>👥</Text>
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemLabel}>Partager</Text>
                    <Text style={styles.menuItemDesc}>Inviter des membres à collaborer</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Paramètres du roadtrip */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate('RoadtripSettings', { roadtripId: id });
                }}
              >
                <Text style={styles.menuItemIcon}>⚙️</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>Paramètres</Text>
                  <Text style={styles.menuItemDesc}>Boutons de recherche rapide, filtres, actions</Text>
                </View>
              </TouchableOpacity>

              {/* Rôle actuel */}
              <View style={styles.menuRoleRow}>
                <Text style={styles.menuRoleLabel}>
                  {isOwner ? '👑 Organisateur' : userRole === 'EDITOR' ? '✏️ Éditeur' : userRole === 'VIEWER' ? '👁 Lecteur' : ''}
                </Text>
              </View>

              {/* Fermer */}
              <TouchableOpacity
                style={styles.menuCloseBtn}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={styles.menuCloseBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  } catch (err) {
    console.error('❌ [RoadtripDetail] ERREUR RENDER:', err);
    return (
      <View style={styles.container}>
        <Text style={{ color: 'red', padding: 20 }}>
          Erreur: {err.message}
        </Text>
      </View>
    );
  }
}

// ─── StepDetailModal ─────────────────────────────────────────────────────────
function StepDetailModal({ step, index, color, onClose, onNext }) {
  console.log('[StepDetailModal] Rendu:', step?.name);
  const nights = durationDays(step.startDate, step.endDate);
  const insets = useSafeAreaInsets();

  const formatDayMonth = (dateStr) => {
    if (!dateStr) return '--/--';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (Number.isNaN(date.getTime())) return '--/--';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const formatHourMinute = (timeValue, fallbackDateStr) => {
    if (timeValue) {
      if (typeof timeValue === 'string') {
        const hhmm = timeValue.match(/^(\d{2}:\d{2})/);
        if (hhmm?.[1]) return hhmm[1];
      }
      const parsed = new Date(timeValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    if (fallbackDateStr && typeof fallbackDateStr === 'string' && fallbackDateStr.includes('T')) {
      const date = new Date(fallbackDateStr);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    return '--:--';
  };

  return (
    <SafeAreaView style={styles.detailContainer}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onClose} style={styles.detailBack}>
          <Text style={styles.detailBackText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{step.name}</Text>
        <TouchableOpacity style={styles.detailEdit}>
          <Text style={styles.detailEditText}>✎</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Adresse */}
        <View style={styles.detailSection}>
          <View style={styles.addressBox}>
            <Text style={styles.addressIcon}>📍</Text>
            <Text style={styles.addressText}>{step.location || 'Adresse non disponible'}</Text>
          </View>
        </View>

        {/* Dates (ARRIVÉE / DÉPART) */}
        <View style={styles.datesRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>ARRIVÉE</Text>
            <View style={styles.dateDetailRow}>
              <Text style={styles.dateDetailLabel}>Date :</Text>
              <Text style={styles.dateDetailValue}>{formatDayMonth(step.startDate)}</Text>
            </View>
            <View style={styles.dateDetailRow}>
              <Text style={styles.dateDetailLabel}>Heure :</Text>
              <Text style={styles.dateDetailValue}>{formatHourMinute(step.arrivalTime, step.startDate)}</Text>
            </View>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>DÉPART</Text>
            <View style={styles.dateDetailRow}>
              <Text style={styles.dateDetailLabel}>Date :</Text>
              <Text style={styles.dateDetailValue}>{formatDayMonth(step.endDate)}</Text>
            </View>
            <View style={styles.dateDetailRow}>
              <Text style={styles.dateDetailLabel}>Heure :</Text>
              <Text style={styles.dateDetailValue}>{formatHourMinute(step.departureTime, step.endDate)}</Text>
            </View>
          </View>
        </View>

        {/* Trajet depuis l'étape précédente */}
        {(step.distanceFromPrev || step.durationFromPrev) && (
          <View style={styles.trajetBox}>
            <Text style={styles.trajetIcon}>🚐</Text>
            <View style={styles.trajetInfo}>
              <Text style={styles.trajetFrom}>Depuis {step.prevStepName || 'étape précédente'}</Text>
              <View style={styles.trajetStats}>
                <Text style={styles.trajetDistance}>{Math.round(step.distanceFromPrev || 0)} km</Text>
                <View style={styles.trajetDot} />
                <Text style={styles.trajetDuration}>
                  {step.durationFromPrev
                    ? step.durationFromPrev >= 60
                      ? `${Math.floor(step.durationFromPrev / 60)}h${String(Math.round(step.durationFromPrev % 60)).padStart(2, '0')}`
                      : `${Math.round(step.durationFromPrev)} min`
                    : '-'}
                </Text>
              </View>
            </View>
            {step.route && (
              <View style={styles.routeBadge}>
                <Text style={styles.routeBadgeText}>{step.route}</Text>
              </View>
            )}
          </View>
        )}

        {/* Hébergements */}
        {step.accommodation && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>HÉBERGEMENTS</Text>
            <View style={styles.detailCard}>
              <View style={styles.cardIconBg}>
                <Text style={styles.cardIcon}>{ACCOM_ICONS[step.accommodation.type] || '🏕️'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{step.accommodation.name}</Text>
                {step.accommodation.bookingRef && (
                  <Text style={styles.cardSub}>Réservation {step.accommodation.bookingRef}{step.accommodation.price ? ` · ${step.accommodation.price}` : ''}</Text>
                )}
              </View>
              <View style={step.accommodation.status === 'BOOKED' ? styles.cardStatusOk : styles.cardStatusWarn}>
                <Text style={step.accommodation.status === 'BOOKED' ? styles.cardStatusOkText : styles.cardStatusWarnText}>
                  {step.accommodation.status === 'BOOKED' ? '✅ Résa OK' : '⚠️ À réserver'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Activités */}
        {step.activities?.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>ACTIVITÉS</Text>
            {step.activities.map((a, i) => (
              <View key={i} style={[styles.detailCard, i < step.activities.length - 1 && { marginBottom: 8 }]}>
                <View style={[styles.cardIconBg, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                  <Text style={styles.cardIcon}>{ACTIVITY_ICONS[a.type] || '🎯'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{a.name}</Text>
                  {a.description && <Text style={styles.cardSub}>{a.description}</Text>}
                </View>
                <View style={a.status === 'BOOKED' ? styles.cardStatusOk : styles.cardStatusWarn}>
                  <Text style={a.status === 'BOOKED' ? styles.cardStatusOkText : styles.cardStatusWarnText}>
                    {a.status === 'BOOKED' ? '✅ Réservé' : '⏳ À planifier'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {step.notes && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{step.notes}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── MarkerAction (petite icône carrée pour la grille du menu) ──────────────
function MarkerAction({ icon, label, color, bg, onPress }) {
  return (
    <TouchableOpacity style={styles.markerGridItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.markerGridIconBox, { backgroundColor: bg }]}>
        <Text style={styles.markerGridIcon}>{icon}</Text>
      </View>
      <Text style={[styles.markerGridLabel, { color: color || '#fff' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header container (not absolute)
  headerContainer: {
    backgroundColor: 'rgba(26,26,38,0.98)',
    paddingTop: 0,
    zIndex: 100,
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    height: 44,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 18, color: '#fff', fontWeight: '600' },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },

  // Search area (part of header black bar)
  searchArea: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: SPACING.sm,
    backgroundColor: 'rgba(26,26,38,0.98)',
    zIndex: 100,
    position: 'relative',
    overflow: 'visible',
  },
  searchBar: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 50,
    overflow: 'visible',
    pointerEvents: 'box-none',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
    margin: 0,
    height: 38,
  },
  zoneBtn: {
    backgroundColor: 'rgba(59,130,246,0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  zoneBtnActive: { backgroundColor: 'rgba(59,130,246,0.6)' },
  zoneBtnText: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  zoneBtnTextActive: { color: '#fff' },

  // Suggestions dropdown — absolutely positioned at headerContainer level
  suggestionsDropdown: {
    position: 'absolute',
    top: 100, // searchArea ~56px + catBar ~44px
    left: 12,
    right: 12,
    zIndex: 9999,
    backgroundColor: '#1a1a26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  suggestionRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  suggestionMainText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  suggestionSubText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },

  // Suggestions dropdown (old name, kept for compat)
  suggestionsList: {
    position: 'absolute',
    top: '100%',
    left: 12,
    right: 12,
    zIndex: 999,
    backgroundColor: '#1a1a26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    maxHeight: 250,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  suggestionTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  suggestionSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

  // Map container (flex: 1 to fill remaining space)
  mapContainer: {
    flex: 1,
    position: 'relative',
  },

  // Overlay buttons (absolute within map)
  overlayCol: {
    position: 'absolute',
    right: 12,
    zIndex: 20,
    gap: 8,
  },
  ovBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  ovBtnActive: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  ovBtnGlobal: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  ovBtnIcon: { fontSize: 16 },

  // ─── (satToggle supprimé, utilise ovBtn) ─────────────────────────────

  // ─── (stepNav supprimé) ──────────────────────────────────────────────

  // Map markers
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Category bar (horizontal buttons under search)
  catBar: {
    maxHeight: 46,
    backgroundColor: 'rgba(26,26,38,0.98)',
    paddingBottom: 6,
  },
  catBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  catBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.25)',
    borderColor: 'rgba(59,130,246,0.5)',
  },
  catBtnIcon: { fontSize: 14 },
  catBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  catBtnLabelActive: {
    color: '#93c5fd',
  },

  // Search result markers for category search
  catResultMarkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catResultMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  catResultMarkerText: { fontSize: 16 },
  catResultLabelBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 4,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  catResultLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },

  // Search result marker
  searchResultMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
  searchResultMarkerText: { fontSize: 24 },

  // Accommodation marker
  accomMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  accomMarkerText: { fontSize: 20 },

  // Activity marker
  activityMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  activityMarkerText: { fontSize: 20 },

  // Parking marker
  parkingMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96, 165, 250, 0.9)',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  parkingMarkerText: { fontSize: 16 },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#1a1a26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignItems: 'center', paddingVertical: 16,
    position: 'relative',
  },
  handleBar: {
    width: 48, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  sheetCloseBtn: {
    position: 'absolute', right: 16, top: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCloseText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  sheetContent: { flex: 1, paddingHorizontal: 16 },

  // Collapsed current step
  currentBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 4,
  },
  currentDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  currentDotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  currentInfo: { flex: 1 },
  currentName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  currentTrajet: { fontSize: 12, color: '#4ade80', marginTop: 2, fontWeight: '500' },
  currentMeta: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  currentBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  currentBadgeText: { fontSize: 10 },

  // Full sheet
  sheetFull: { flex: 1 },
  sheetFullHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  sheetStepCount: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  stepList: { flex: 1, marginTop: 4 },

  // Step cards
  stepCard: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  stepCardActive: {
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 8,
    borderBottomColor: 'transparent',
  },
  timelineCol: { width: 20, alignItems: 'center', paddingTop: 2 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 2 },
  stepContent: { flex: 1, marginLeft: 10 },
  stepTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  stepName: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  stepNameActive: { color: '#f59e0b' },
  stepType: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  stepLocation: { fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
  stepTrajet: { fontSize: 12, color: '#4ade80', fontWeight: '500', flexShrink: 1 },
  stepMeta: { flexDirection: 'row', gap: 8, marginTop: 1, alignItems: 'center' },
  stepMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tagAccom: {
    fontSize: 11, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4,
    backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ade80',
    overflow: 'hidden',
  },
  tagActivity: {
    fontSize: 10, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4,
    backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa',
    overflow: 'hidden',
  },
  tagMore: { fontSize: 10, color: 'rgba(255,255,255,0.3)', paddingVertical: 2 },
  travelCol: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8, minWidth: 48 },
  travelTime: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  travelDist: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },


  // Detail modal
  detailContainer: { flex: 1, backgroundColor: '#1a1a26' },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  detailBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  detailBackText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  detailTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  detailEdit: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  detailEditText: { color: '#fff', fontSize: 16 },
  detailBody: { flex: 1, padding: SPACING.md },
  detailMap: { height: 100, borderRadius: 12, overflow: 'hidden', marginBottom: SPACING.md },

  // Adresse
  addressBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  addressIcon: { fontSize: 18, marginTop: 2 },
  addressText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },

  // Dates
  datesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.md,
  },
  dateBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  dateDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dateDetailLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  dateDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  dateValue: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Trajet
  trajetBox: {
    backgroundColor: 'rgba(34,197,94,0.06)',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.1)',
    marginBottom: SPACING.md,
  },
  trajetIcon: { fontSize: 18 },
  trajetInfo: { flex: 1 },
  trajetFrom: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  trajetStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trajetDistance: { fontSize: 13, fontWeight: '600', color: '#fff' },
  trajetDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  trajetDuration: { fontSize: 13, fontWeight: '600', color: '#4ade80' },
  routeBadge: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  routeBadgeText: { fontSize: 10, fontWeight: '600', color: '#4ade80' },

  detailSection: { marginBottom: SPACING.md + 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, color: 'rgba(255,255,255,0.3)', marginBottom: 8,
  },
  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  infoItem: {
    width: '48%', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 10,
  },
  infoLabel: {
    fontSize: 10, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)', letterSpacing: 0.3, marginBottom: 2,
  },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  detailCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  cardIconBg: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  cardSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  cardStatusOk: {
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  cardStatusOkText: { fontSize: 10, fontWeight: '600', color: '#4ade80' },
  cardStatusWarn: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  cardStatusWarnText: { fontSize: 10, fontWeight: '600', color: '#fbbf24' },
  notesBox: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10,
    padding: 12, minHeight: 50,
  },
  notesText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },
  detailActions: {
    flexDirection: 'row', gap: 8, marginTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  actionSecondary: {
    flex: 1, padding: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  actionPrimary: {
    flex: 1, padding: 12, borderRadius: 10,
    backgroundColor: '#f59e0b', alignItems: 'center',
  },
  actionPrimaryText: { fontSize: 13, fontWeight: '700', color: '#1a1a26' },

  // Search result modal
  searchResultModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  searchResultModalContent: {
    backgroundColor: '#1a1a26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    maxHeight: '70%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  searchResultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  searchResultClose: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    padding: 8,
  },
  searchResultSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: SPACING.sm,
  },
  searchResultDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: SPACING.sm,
  },
  searchResultActionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  // AllTrails stats row
  trailStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    marginBottom: 4,
  },
  trailStatsText: {
    fontSize: 13,
    color: '#4ade80',
    fontWeight: '600',
  },

  // Photo du lieu (Google Places)
  poiPhotoContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  poiPhoto: {
    width: '100%',
    height: 160,
    borderRadius: 10,
  },

  // Note et avis (Google Places)
  poiRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    marginBottom: 6,
  },
  poiRatingStars: {
    fontSize: 14,
  },
  poiRatingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },

  searchResultAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    marginBottom: 8,
  },
  searchResultActionIcon: {
    fontSize: 24,
  },
  searchResultActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },

  // ─── Menu hamburger ─────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#1a1a26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    marginBottom: 10,
  },
  menuItemIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  menuItemDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  menuRoleRow: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  menuRoleLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  menuCloseBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginTop: SPACING.xs,
  },
  menuCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },

  // ─── Marqueur : menu contextuel (volet bas) ──────────────────────────────
  markerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  markerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  markerMenuHeader: {
    position: 'relative',
    marginBottom: 2,
    paddingRight: 40,
  },
  markerMenuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 26,
  },
  markerMenuClose: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerMenuCloseText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  markerMenuBadge: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
  },
  markerInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  markerInfoChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  markerInfoChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  markerActionSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  markerActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  markerGridItem: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  markerGridIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  markerGridIcon: {
    fontSize: 20,
  },
  markerGridLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  markerPhotoContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  markerResetBtn: {
    backgroundColor: 'rgba(232,84,53,0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,84,53,0.2)',
  },
  markerResetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
  },
});

// ─── Google Maps dark style ──────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a26' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a26' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2d2d3a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#24242e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d3a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
];
