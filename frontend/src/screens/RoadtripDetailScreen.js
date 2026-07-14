import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  ScrollView, Animated, StatusBar, Alert, ActivityIndicator,
  Modal, TextInput, Platform, PanResponder,
} from 'react-native';
import { useQuery } from '@powersync/react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Récupération de la clé API Google ─────────────────────────────────────
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

// ─── Constantes ──────────────────────────────────────────────────────────────
const SHEET_COLLAPSED = 150;
const SHEET_FULL = SCREEN_H - 200;

const ORDER_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
];

const ACCOM_ICONS = {
  HOTEL: '🏨', AIRBNB: '🏠', CAMPING: '🏕️', HOSTEL: '🛏️', OTHER: '🏪',
};

const ACTIVITY_ICONS = {
  ACTIVITY: '🎯', RESTAURANT: '🍽️', TRANSPORT: '🚌', OTHER: '📌',
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

// ─── Données mock pour prototype ─────────────────────────────────────────────
// ─── StepCard (compact pour la liste) ────────────────────────────────────────
function StepCard({ step, index, isActive, onPress, onDetailPress, color }) {
  console.log(`[StepCard] Rendu step ${index}:`, { 
    name: step?.name,
    hasActivities: !!step?.activities?.length,
    activities: step?.activities,
    accommodation: step?.accommodation
  });
  const nights = durationDays(step.startDate, step.endDate);
  const hasAccom = !!step.accommodation;
  const hasActivities = step.activities?.length > 0;

  return (
    <View style={[styles.stepCard, isActive && styles.stepCardActive]}>
      <TouchableOpacity
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row' }}
        activeOpacity={0.7}
      >
        {/* Timeline dot */}
        <View style={styles.timelineCol}>
          <View style={[styles.timelineDot, { backgroundColor: color }]} />
          <View style={styles.timelineLine} />
        </View>

        {/* Content */}
        <View style={styles.stepContent}>
          <View style={styles.stepTopRow}>
            <Text style={[styles.stepName, isActive && styles.stepNameActive]} numberOfLines={1}>
              {step.name}
            </Text>
            {step.type && step.type !== 'STAGE' && (
              <Text style={styles.stepType}>{step.type === 'DEPARTURE' ? 'DÉPART' : step.type === 'STOP' ? 'STOP' : step.type}</Text>
            )}
          </View>
          <Text style={styles.stepLocation} numberOfLines={1}>{step.location}</Text>
          {(step.distanceFromPrev || 0) > 0 && (
            <Text style={styles.stepTrajet}>
              🚐 {step.distanceFromPrev || 0} km{(step.durationFromPrev || 0) > 0 ? ` • ${(step.durationFromPrev || 0) >= 60 ? `${Math.floor((step.durationFromPrev || 0) / 60)}h${String(Math.round((step.durationFromPrev || 0) % 60)).padStart(2, '0')}` : `${Math.round(step.durationFromPrev || 0)}min`}` : ''}
            </Text>
          )}
          {(step.startDate || step.endDate || nights > 0) ? (
            <View style={styles.stepMeta}>
              {step.startDate && (
                <Text style={styles.stepMetaText}>
                  📅 {formatDate(step.startDate)}{step.endDate ? ` → ${formatDate(step.endDate)}` : ''}
                </Text>
              )}
              {step.endDate && !step.startDate && (
                <Text style={styles.stepMetaText}>
                  📅 → {formatDate(step.endDate)}
                </Text>
              )}
              {nights > 0 && <Text style={styles.stepMetaText}>🌙 {nights} nuit{nights > 1 ? 's' : ''}</Text>}
            </View>
          ) : null}
          {hasAccom && (
            <View style={styles.tagRow}>
              <Text style={styles.tagAccom}>
                {ACCOM_ICONS[step.accommodation.type] || '🏕️'} {step.accommodation.name}
              </Text>
            </View>
          )}
          {hasActivities && (
            <View style={styles.tagRow}>
              {step.activities.slice(0, 2).map((a, i) => (
                <Text key={i} style={styles.tagActivity}>🥾 {a.name}</Text>
              ))}
              {step.activities.length > 2 && (
                <Text style={styles.tagMore}>+{step.activities.length - 2}</Text>
              )}
            </View>
          )}
        </View>

        {/* Travel time */}
        {(step.distanceFromPrev || 0) > 0 && (
          <View style={styles.travelCol}>
            <Text style={styles.travelTime}>
              {(step.durationFromPrev || 0) >= 60
                ? `${Math.floor((step.durationFromPrev || 0) / 60)}h${String(Math.round((step.durationFromPrev || 0) % 60)).padStart(2, '0')}`
                : `${Math.round(step.durationFromPrev || 0)} min`}
            </Text>
            <Text style={styles.travelDist}>{Math.round(step.distanceFromPrev || 0)} km</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Bouton info détail */}
      <TouchableOpacity
        onPress={onDetailPress}
        style={styles.stepDetailBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.stepDetailBtnText}>ℹ️</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Detail card pour l'étape active (mode collapsed) ────────────────────────
function CurrentStepBar({ step, index, color, onPress }) {
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
      </View>
      {step.accommodation?.status === 'BOOKED' && (
        <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>🏕️ ✅</Text></View>
      )}
    </TouchableOpacity>
  );
}

// ─── Overlay map buttons ─────────────────────────────────────────────────────
const OVERLAY_ITEMS = [
  { key: 'campings', icon: '🏕️', label: 'Campings' },
  { key: 'trails', icon: '🥾', label: 'Sentiers' },
  { key: 'pois', icon: '📍', label: 'POI' },
  { key: 'p4n', icon: '🅿️', label: 'P4N' },
];

// ─── Écran principal ─────────────────────────────────────────────────────────
export default function RoadtripDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const insets = useSafeAreaInsets();

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

  // Transformer les steps PowerSync en format utilisable
  const transformedSteps = useMemo(() => {
    console.log('[transformedSteps] ⚙️ DEBUT useMemo, distancesVersion:', distancesVersion);  // 🎯 DEBUG
    console.log('[transformedSteps] Recalcul avec psSteps:', psSteps?.length, 'polylinesLoaded:', polylinesLoaded, 'cachedDistances:', Object.keys(distancesMapRef.current).length);
    if (psSteps.length === 0) {
      console.log('[transformedSteps] psSteps vides → utilise BD');
      return [];
    }
    
    const result = psSteps.map((step, idx) => {
      const stepAccommodations = psAccommodations.filter(a => a.stepId === step.id);
      const stepActivities = psActivities.filter(a => a.stepId === step.id);
      
      // 🎯 PRIORITE 1 : Utiliser les distances du cache (vraies distances Google Routes)
      if (distancesMapRef.current[step.id]) {
        const { distance, duration } = distancesMapRef.current[step.id];
        console.log('[transformedSteps] Step', idx, `${step.name}: ${distance}km du cache`);
        return {
          ...step,
          distanceFromPrev: distance,
          durationFromPrev: duration,
          accommodation: stepAccommodations.length > 0 ? { ...stepAccommodations[0], status: 'BOOKED' } : null,
          activities: stepActivities,
        };
      }
      
      // 🎯 FALLBACK : Pas de vraies distances encore (cache vide) → affiche 0 (pas de Haversine!)
      console.warn('[transformedSteps] Step', idx, `${step.name}: PAS DE DISTANCE EN CACHE — attente calcul Google Routes API`);
      return {
        ...step,
        distanceFromPrev: 0,  // ← Force 0, pas de Haversine
        durationFromPrev: 0,
        accommodation: stepAccommodations.length > 0 ? { ...stepAccommodations[0], status: 'BOOKED' } : null,
        activities: stepActivities,
      };
    });
    console.log('[transformedSteps] ✓', result.length, 'steps calculés');
    return result;
  }, [psSteps, psAccommodations, psActivities, id, polylinesLoaded, distancesVersion]);

  // États
  const [steps, setSteps] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState({});
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [roadtrip, setRoadtrip] = useState({ title: 'Europe', distance: 3610 });
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [routes, setRoutes] = useState([]);  // Itinéraires entre étapes
  const [loadingFromAPI, setLoadingFromAPI] = useState(false);
  const [refreshingRoutes, setRefreshingRoutes] = useState(false);
  const [polylinesLoaded, setPolylinesLoaded] = useState(false);  // Track si polylines chargées
  const shouldRefreshRef = useRef(false);  // Ref pour éviter infinite loop sur refreshingRoutes
  const [refreshCounter, setRefreshCounter] = useState(0);  // Trigger pour le useEffect directions

  // Créer une clé stable des steps pour éviter re-trigger inutile quand PowerSync retourne une nouvelle array
  const stepsLength = steps.length;

  // Mettre à jour la ref quand utilisateur clique 🔄 Refresh
  useEffect(() => {
    console.log('[Refresh] useEffect refreshingRoutes:', refreshingRoutes);
    if (refreshingRoutes) {
      console.log('[Refresh] >>> REFRESH DÉCLENCHÉ <<<');
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
    setSelectedIndex(0);
    setSheetExpanded(false);
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

  // Mettre à jour steps quand transformedSteps change
  useEffect(() => {
    console.log('[RoadtripDetail] 📌 Mise à jour de steps, transformedSteps:', transformedSteps.length);
    setSteps(transformedSteps);
  }, [transformedSteps]);

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
                console.log('[Directions] ✓ Polylines chargées depuis API pour route', i);
              } catch (err) {
                console.log('[Directions] Erreur décodage:', err.message);
              }
            }
          }

          if (routesFromDB.length > 0) {
            polylinesRef.current = routesFromDB;
            setRoutes(routesFromDB);
            
            // Recalculer les distances manquantes (distance=0 en DB) via Google API
            const token = useAuthStore.getState().token;
            for (let i = 0; i < stepsWithPolylines.length - 1; i++) {
              const current = stepsWithPolylines[i];
              const next = stepsWithPolylines[i + 1];
              if (current.routeEncodedPolyline && (
                !current.routeDistanceMeters || current.routeDistanceMeters === 0 ||
                !current.routeDurationSeconds || current.routeDurationSeconds === 0
              )) {
                if (!GOOGLE_API_KEY || !current.latitude || !next.latitude) continue;
                try {
                  const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
                    method: 'POST',
                    headers: {
                      'X-Goog-Api-Key': GOOGLE_API_KEY,
                      'X-Goog-FieldMask': 'routes.legs.distanceMeters,routes.legs.duration',
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      origin: { location: { latLng: { latitude: parseFloat(current.latitude), longitude: parseFloat(current.longitude) } } },
                      destination: { location: { latLng: { latitude: parseFloat(next.latitude), longitude: parseFloat(next.longitude) } } },
                      travelMode: 'DRIVE',
                    }),
                  });
                  const rdata = await resp.json();
                  const leg = rdata.routes?.[0]?.legs?.[0];
                  if (leg) {
                    const distM = leg.distanceMeters || 0;
                    // Duration est soit "3600s" (string) soit {seconds: "3600"} (objet)
                    const durRaw = leg.duration;
                    console.log('[Directions] durRaw:', JSON.stringify(durRaw), 'type:', typeof durRaw);
                    const durS = typeof durRaw === 'string' ? parseInt(durRaw) : parseInt(durRaw?.seconds) || 0;
                    distancesMap[next.id] = { distance: Math.round(distM / 1000), duration: Math.round(durS / 60) };
                    // Persister en BD
                    await fetch(`${API_URL}/api/steps/${current.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ routeDistanceMeters: distM, routeDurationSeconds: durS }),
                    });
                    console.log('[Directions] ✓ Distance recalculée pour route', i, ':', Math.round(distM/1000), 'km');
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
      }
    };

    loadPolylines();
  }, [stepsLength, id]);

  // Animation de la bottom sheet
  const sheetAnim = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const mapRef = useRef(null);
  const sheetExpandedRef = useRef(false);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const stepListRef = useRef(null);

  // Synchroniser les steps avec PowerSync
  useEffect(() => {
    setSteps(transformedSteps);
  }, [transformedSteps]);

  // Sync ref avec state pour PanResponder
  useEffect(() => {
    sheetExpandedRef.current = sheetExpanded;
  }, [sheetExpanded]);

  // Scroller vers l'étape sélectionnée quand le volet s'agrandit
  useEffect(() => {
    if (sheetExpanded && stepListRef.current && selectedIndex >= 0) {
      // Chaque StepCard a une hauteur approximative de ~110px, scroll pour centrer l'étape
      const offsetY = Math.max(0, selectedIndex * 110 - 150);
      stepListRef.current.scrollTo({ y: offsetY, animated: true });
    }
  }, [sheetExpanded, selectedIndex]);

  // PanResponder sur la poignée uniquement
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        const isExpanded = sheetExpandedRef.current;
        const base = isExpanded ? SHEET_FULL : SHEET_COLLAPSED;
        const next = Math.max(SHEET_COLLAPSED, Math.min(SHEET_FULL, base - gs.dy));
        sheetAnim.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const isExpanded = sheetExpandedRef.current;
        // Swipe vers le haut (dy < -40) → ouvrir ; vers le bas (dy > 40) → fermer
        const shouldExpand = gs.dy < -40;
        const toValue = shouldExpand ? SHEET_FULL : SHEET_COLLAPSED;
        Animated.spring(sheetAnim, {
          toValue,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }).start();
        sheetExpandedRef.current = shouldExpand;
        setSheetExpanded(shouldExpand);
      },
    })
  ).current;

  // Charger les itinéraires : d'abord depuis la BD, puis recalculer si refreshing + SAUVEGARDER
  useEffect(() => {
    console.log('[Directions2] useEffect déclenché, stepsLength:', stepsLength, 'refreshCounter:', refreshCounter, 'shouldRefresh:', shouldRefreshRef.current);
    const loadRoutes = async () => {
      const needsRefresh = shouldRefreshRef.current;
      shouldRefreshRef.current = false;  // Reset immédiatement
      console.log('[Directions2] loadRoutes, needsRefresh:', needsRefresh);
      
      // 🎯 GARDE ABSOLUE : si le premier useEffect gère les polylines, on ne touche à rien
      if (!needsRefresh && (polylinesLoadingRef.current || polylinesFetchedRef.current)) {
        console.log('[Directions] Premier useEffect gère les polylines, second useEffect skip total');
        return;
      }
      
      // 🎯 Si les directions ont déjà été calculées et pas de refresh, skip
      if (directionsCalculatedRef.current && !needsRefresh) {
        console.log('[Directions] ✓ Directions déjà calculées, skip');
        if (polylinesRef.current.length > 0) {
          setRoutes(polylinesRef.current);
        }
        return;
      }
      
      if (steps.length < 2) return;
      
      const newRoutes = [];
      const polylinesToSave = {}; // { stepIndex: encodedPolyline }
      
      // Étape 1: Charger les polylines existantes depuis la BD
      if (!needsRefresh) {
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
              console.log('[Directions] ✓ Chargé depuis BD: route', i);
              
              // 🎯 Remplir le cache avec les distances existantes
              if (current.routeDistanceMeters && current.routeDurationSeconds) {
                distancesFromBD[next.id] = {
                  distance: Math.round(current.routeDistanceMeters / 1000),
                  duration: Math.round(current.routeDurationSeconds / 60),
                };
                console.log('[Directions] 📏 Distance BD pour', next.name, ':', distancesFromBD[next.id].distance, 'km');
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
          directionsCalculatedRef.current = true;
          return;
        }
      }
      
      // Étape 2: Recalculer les routes manquantes (ou toutes si refreshing)
      // 🎯 AUSSI recalculer les routes avec distance = 0
      const routesNeedingRecalc = [];
      for (let i = 0; i < steps.length - 1; i++) {
        const current = steps[i];
        const hasPolyline = current.routeEncodedPolyline;
        const hasDistance = current.routeDistanceMeters && current.routeDistanceMeters > 0;
        // Recalcul si : PAS de polyline OU distance = 0 OU refreshing
        if (!hasPolyline || !hasDistance || needsRefresh) {
          routesNeedingRecalc.push(i);
        }
      }
      
      console.log('[Directions] Routes à recalculer:', routesNeedingRecalc.length, 'index:', routesNeedingRecalc.join(', '));
      
      if (routesNeedingRecalc.length === 0) {
        console.log('[Directions] ✓ Toutes les routes OK (polyline + distance > 0)');
        if (!needsRefresh && polylinesRef.current.length > 0) {
          setRoutes(polylinesRef.current);
        } else {
          setRoutes(newRoutes);
        }
        setRefreshingRoutes(false);
        directionsCalculatedRef.current = true;
        return;
      }
      
      if (!GOOGLE_API_KEY) {
        console.log('[Directions] Pas de API_KEY, fallback ligne droite');
        setRefreshingRoutes(false);
        return;
      }
      
      try {
        for (const i of routesNeedingRecalc) {
          const current = steps[i];
          const next = steps[i + 1];
          
          if (!current.latitude || !current.longitude || !next.latitude || !next.longitude) {
            console.log('[Directions] Route', i, ': coordonnées manquantes');
            newRoutes.push({
              coordinates: [
                { latitude: parseFloat(current.latitude), longitude: parseFloat(current.longitude) },
                { latitude: parseFloat(next.latitude), longitude: parseFloat(next.longitude) },
              ],
              color: ORDER_COLORS[i % ORDER_COLORS.length],
            });
            continue;
          }
          
          let coordinates = null;
          let encodedPolyline = null;
          let routeDistanceMeters = 0;
          let routeDurationSeconds = 0;
          
          try {
            const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
            const body = {
              origin: { location: { latLng: { latitude: parseFloat(current.latitude), longitude: parseFloat(current.longitude) } } },
              destination: { location: { latLng: { latitude: parseFloat(next.latitude), longitude: parseFloat(next.longitude) } } },
              travelMode: 'DRIVE',
            };
            
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'X-Goog-Api-Key': GOOGLE_API_KEY,
                'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });
            
            const data = await response.json();
            if (!data.routes?.[0]?.polyline?.encodedPolyline) {
              console.log('[Directions] Route', i, 'réponse API:', response.status, JSON.stringify(data));
            }
            if (data.routes?.[0]?.polyline?.encodedPolyline) {
              encodedPolyline = data.routes[0].polyline.encodedPolyline;
              coordinates = decodePolyline(encodedPolyline);
              
              // Extraire les vraies distances/durées de Google Routes
              if (data.routes[0].legs?.[0]) {
                const leg = data.routes[0].legs[0];
                routeDistanceMeters = leg.distanceMeters || parseInt(leg.distance?.value) || 0;
                const durRaw = leg.duration;
                routeDurationSeconds = typeof durRaw === 'string' ? parseInt(durRaw) : parseInt(durRaw?.seconds) || 0;
              }
              
              // Sauvegarder les données complètes
              polylinesToSave[i] = {
                polyline: encodedPolyline,
                distance: routeDistanceMeters,
                duration: routeDurationSeconds,
              };
              
              console.log('[Directions] Route', i, '✓ API:', 
                `${Math.round(routeDistanceMeters/1000)}km / ${Math.round(routeDurationSeconds/60)}min`, 
                coordinates.length, 'points');
            }
          } catch (err) {
            console.log('[Directions] Route', i, 'erreur API:', err.message);
          }
          
          // Fallback
          if (!coordinates) {
            coordinates = [
              { latitude: parseFloat(current.latitude), longitude: parseFloat(current.longitude) },
              { latitude: parseFloat(next.latitude), longitude: parseFloat(next.longitude) },
            ];
          }
          
          newRoutes.push({
            coordinates,
            color: ORDER_COLORS[i % ORDER_COLORS.length],
          });
        }
        
        console.log('[Directions] Final:', newRoutes.length, 'routes, à sauvegarder:', Object.keys(polylinesToSave).length);
        // 🎯 Ne jamais écraser les polylines du premier useEffect sauf si refresh explicite
        if (!needsRefresh && polylinesRef.current.length > 0) {
          console.log('[Directions] ✓ Polylines protégées, on garde celles du premier useEffect');
          setRoutes(polylinesRef.current);
        } else {
          polylinesRef.current = newRoutes;
          setRoutes(newRoutes);
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
          for (const [idx, routeData] of Object.entries(polylinesToSave)) {
            const stepIdx = parseInt(idx);
            if (stepIdx >= steps.length) {
              console.log('[Directions] Index hors limites:', stepIdx, '/', steps.length);
              continue;
            }
            const step = steps[stepIdx];
            const stepId = step.id;
            console.log('[Directions] Save route pour step', stepIdx, 
              `(${Math.round(routeData.distance/1000)}km / ${Math.round(routeData.duration/60)}min)`);
            try {
              const response = await fetch(`http://192.168.1.38:3111/api/steps/${stepId}`, {
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
                console.log('[Directions] ✓ Route sauvée pour step', stepId);
              } else {
                const errText = await response.text();
                console.log('[Directions] ✗ Erreur save step', stepId, response.status, errText);
              }
            } catch (err) {
              console.log('[Directions] Erreur save route:', err.message);
            }
          }
        }
      } catch (err) {
        console.error('[Directions] Erreur:', err);
      }
      
      // 🎯 Marker que le calcul des directions est terminé
      directionsCalculatedRef.current = true;
    };
    
    loadRoutes();
  }, [stepsLength, refreshCounter]);

  // Injecter titre + hamburger dans la barre de navigation native
  React.useLayoutEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    console.log('[Places] API Key:', apiKey ? `CHARGÉE (${apiKey.slice(0, 8)}...)` : 'NON TROUVÉE — vérifie .env → EXPO_PUBLIC_GOOGLE_PLACES_API_KEY');
    navigation.setOptions({
      headerShown: true,
      headerTitle: roadtrip.title,
      headerTitleAlign: 'center',
      headerTitleStyle: { color: '#fff', fontSize: 18, fontWeight: '700' },
      headerStyle: { backgroundColor: 'rgba(26,26,38,1)' },
      headerTintColor: '#fff',
      headerRight: () => (
        <TouchableOpacity style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 18, color: '#fff' }}>☰</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, roadtrip.title]);

  const toggleSheet = useCallback(() => {
    const toValue = sheetExpanded ? SHEET_COLLAPSED : SHEET_FULL;
    Animated.spring(sheetAnim, {
      toValue,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
    setSheetExpanded(!sheetExpanded);
  }, [sheetExpanded, sheetAnim]);

  const openDetail = useCallback((index) => {
    setSelectedIndex(index);
    setShowDetail(true);
  }, []);

  const toggleOverlay = useCallback((key) => {
    setActiveOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Recherche Google Places avec throttle
  const searchPlaces = useCallback(async (query) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('[Places] Searching for:', query);
        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
          },
          body: JSON.stringify({
            input: query,
            languageCode: 'fr',
          }),
        });
        const data = await response.json();
        console.log('[Places] Response:', data);
        const predictions = data.suggestions || [];
        
        // Parser la structure : suggestions[] contient placePrediction{}
        const formatted = predictions.map(p => {
          const pp = p.placePrediction || {};
          const structured = pp.structuredFormat || {};
          const mainText = structured.mainText?.text || '';
          const secondaryText = structured.secondaryText?.text || '';
          
          console.log('[Places] Extracted:', { mainText, secondaryText, placeId: pp.placeId });
          
          return {
            mainText,
            secondaryText,
            placeId: pp.placeId,
            place: pp.place,
            // location sera fetch séparément si besoin
          };
        }).slice(0, 8);
        
        console.log('[Places] Formatted suggestions:', formatted);
        setSuggestions(formatted);
      } catch (err) {
        console.error('[Places Search] Error:', err);
        setSuggestions([]);
      }
    }, 300);
  }, []);

  const region = computeRegion(steps);
  const selectedStep = steps[selectedIndex];
  const color = ORDER_COLORS[selectedIndex % ORDER_COLORS.length];

  console.log('[RoadtripDetail] 📱 Rendu:', steps.length, 'steps, idx:', selectedIndex);
  
  // Vérifier la structure des premiers steps
  if (steps.length > 0) {
    if (steps[0]) {
      const { routeEncodedPolyline, ...stepWithoutPolyline } = steps[0];
      console.log('[StepStructure] First step:', JSON.stringify(stepWithoutPolyline, null, 2));
    }
  }

  try {
    return (
      <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ─── SEARCH (sous la nav native) ───────────────────────────────── */}
      <View style={styles.headerContainer}>
        {/* Search + Zone on same row */}
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

          <TouchableOpacity
            onPress={() => setShowSearchArea(!showSearchArea)}
            style={[styles.zoneBtn, showSearchArea && styles.zoneBtnActive]}
          >
            <Text style={[styles.zoneBtnText, showSearchArea && styles.zoneBtnTextActive]}>🔍 Zone</Text>
          </TouchableOpacity>
        </View>

        {/* Dropdown suggestions - OUTSIDE searchArea, absolutely positioned */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsDropdown}>
            <ScrollView scrollEnabled={suggestions.length > 5} style={{ maxHeight: 280 }}>
              {suggestions.map((place, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={async () => {
                    // Fetch details pour avoir lat/lng
                    try {
                      const detailsResponse = await fetch(
                        `https://places.googleapis.com/v1/${place.place}`,
                        {
                          headers: {
                            'X-Goog-Api-Key': GOOGLE_API_KEY,
                            'X-Goog-FieldMask': 'location,displayName,formattedAddress',
                          },
                        }
                      );
                      const details = await detailsResponse.json();
                      console.log('[Places] Full details response:', details);
                      
                      const lat = details.location?.latitude;
                      const lng = details.location?.longitude;
                      console.log('[Places] Got location:', { lat, lng });
                      
                      if (lat != null && lng != null && mapRef.current) {
                        mapRef.current.animateToRegion({
                          latitude: lat,
                          longitude: lng,
                          latitudeDelta: 0.05,
                          longitudeDelta: 0.05,
                        }, 500);
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
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          provider={PROVIDER_GOOGLE}
          customMapStyle={DARK_MAP_STYLE}
        >
          {/* Afficher les itinéraires */}
          {routes.map((route, idx) => (
            <Polyline
              key={`route-${idx}`}
              coordinates={route.coordinates}
              strokeColor={route.color}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ))}
          
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
              >
                <View style={[styles.marker, { backgroundColor: ORDER_COLORS[i % ORDER_COLORS.length] }]}>
                  <Text style={styles.markerText}>{i + 1}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>

        {/* ─── OVERLAY BUTTONS (absolute within map) ─────────────────────── */}
        <View style={[styles.overlayCol, { top: '45%' }]}>
          {OVERLAY_ITEMS.map(item => (
            <TouchableOpacity
              key={item.key}
              onPress={() => toggleOverlay(item.key)}
              style={[styles.ovBtn, activeOverlays[item.key] && styles.ovBtnActive]}
            >
              <Text style={styles.ovBtnIcon}>{item.icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── BOTTOM SHEET ──────────────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, { height: sheetAnim }]} pointerEvents="box-none">
        {/* Handle — tap ET swipe pour toggle */}
        <View
          style={styles.sheetHandle}
          {...handlePanResponder.panHandlers}
        >
          <TouchableOpacity onPress={toggleSheet} style={{ alignItems: 'center', paddingVertical: 12 }}>
            <View style={styles.handleBar} />
          </TouchableOpacity>
        </View>
        {sheetExpanded && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center' }}>
            <TouchableOpacity 
              onPress={() => {
                console.log('[UI] Rafraîchir itinéraires');
                setRefreshingRoutes(true);
              }}
              style={{ padding: 8 }}
            >
              <Text style={{ fontSize: 18 }}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleSheet} style={styles.sheetCloseBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sheetContent} pointerEvents={sheetExpanded ? 'auto' : 'none'}>
          {!sheetExpanded && selectedStep ? (
            <CurrentStepBar
              step={selectedStep}
              index={selectedIndex}
              color={color}
              onPress={() => openDetail(selectedIndex)}
            />
          ) : sheetExpanded ? (
            <View style={styles.sheetFull} pointerEvents="auto">
              {/* En-tête */}
              <View style={styles.sheetFullHeader}>
                <Text style={styles.sheetStepCount}>
                  {steps.length} étapes · {roadtrip.distance} km
                </Text>
              </View>

              {/* Liste */}
              <ScrollView
                ref={stepListRef}
                style={styles.stepList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                scrollEnabled={sheetExpanded}
                pointerEvents="auto"
              >
                {steps.map((s, i) => (
                  <StepCard
                    key={s.id}
                    step={s}
                    index={i}
                    isActive={i === selectedIndex}
                    color={ORDER_COLORS[i % ORDER_COLORS.length]}
                    onPress={() => {
                      setSelectedIndex(i);
                      // Fermer le volet
                      setSheetExpanded(false);
                      const toValue = SHEET_COLLAPSED;
                      Animated.spring(sheetAnim, {
                        toValue,
                        useNativeDriver: false,
                        tension: 65,
                        friction: 11,
                      }).start();
                      // Centrer la carte sur l'étape
                      if (s.latitude && s.longitude) {
                        mapRef.current?.animateToRegion({
                          latitude: parseFloat(s.latitude),
                          longitude: parseFloat(s.longitude),
                          latitudeDelta: 0.1,
                          longitudeDelta: 0.1,
                        }, 500);
                      }
                    }}
                    onDetailPress={() => openDetail(i)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Animated.View>

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
        {/* Mini-carte */}
        <View style={styles.detailMap}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: step.latitude || 46.2,
              longitude: step.longitude || 6.1,
              latitudeDelta: 0.5,
              longitudeDelta: 0.5,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            provider={PROVIDER_GOOGLE}
            customMapStyle={DARK_MAP_STYLE}
          >
            {step.latitude && step.longitude && (
              <Marker coordinate={{ latitude: step.latitude, longitude: step.longitude }}>
                <View style={[styles.marker, { backgroundColor: color }]}>
                  <Text style={styles.markerText}>{ACTIVITY_ICONS[step.type] || '📌'}</Text>
                </View>
              </Marker>
            )}
          </MapView>
        </View>

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
            <Text style={styles.dateValue}>{step.startDate ? formatDate(step.startDate, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>DÉPART</Text>
            <Text style={styles.dateValue}>{step.endDate ? formatDate(step.endDate, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</Text>
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
    top: 56, // height of searchArea (paddingVertical 8 + paddingBottom 8 + 40px for input)
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
  ovBtnIcon: { fontSize: 16 },

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
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  stepCardActive: {
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 8,
    borderBottomColor: 'transparent',
  },
  timelineCol: { width: 20, alignItems: 'center', paddingTop: 4 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 2 },
  stepContent: { flex: 1, marginLeft: 10 },
  stepTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepName: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 1 },
  stepNameActive: { color: '#f59e0b' },
  stepType: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  stepLocation: { fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  stepTrajet: { fontSize: 13, color: '#4ade80', marginTop: 3, fontWeight: '500' },
  stepMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2 },
  stepMetaText: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
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
  stepDetailBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  stepDetailBtnText: { fontSize: 14 },

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
