import { useCallback, useRef, useEffect, useState } from 'react'
import {
  GoogleMap,
  Polyline,
} from '@react-google-maps/api'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, Layers, Crosshair, Satellite } from 'lucide-react'
import WaypointMarker from './WaypointMarker'
import CampingMarker from './CampingMarker'
import TrailOverlay from './TrailOverlay'
import POIMarker from './POIMarker'
import Park4NightMarker from './Park4NightMarker'
import { useItineraryStore } from '../../store/itineraryStore'
import { useMapStore, registerFlyToListener, registerFitBoundsListener } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { placesApi, campingsApi, park4nightApi, directionsApi } from '../../services/api'
import type { P4NPlace, Camping, Waypoint } from '../../types'

const MAP_STYLES_DARK: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#2a3a50' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1e2d42' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#b0bfcf' }] },
  { featureType: 'road',               elementType: 'geometry',        stylers: [{ color: '#3e5470' }] },
  { featureType: 'road',               elementType: 'geometry.stroke', stylers: [{ color: '#2a3a52' }] },
  { featureType: 'road.highway',       elementType: 'geometry',        stylers: [{ color: '#5a7299' }] },
  { featureType: 'road.highway',       elementType: 'geometry.stroke', stylers: [{ color: '#2e4870' }] },
  { featureType: 'road.local',         elementType: 'labels.text.fill', stylers: [{ color: '#99aabb' }] },
  { featureType: 'water',              elementType: 'geometry',        stylers: [{ color: '#1a3550' }] },
  { featureType: 'water',              elementType: 'labels.text.fill', stylers: [{ color: '#6a9ab8' }] },
  { featureType: 'poi',                elementType: 'geometry',        stylers: [{ color: '#2a3d52' }] },
  { featureType: 'poi',                elementType: 'labels',          stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',           elementType: 'geometry',        stylers: [{ color: '#1a3828' }] },
  { featureType: 'transit',                                             stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',     elementType: 'geometry.stroke', stylers: [{ color: '#4a6080' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#c0cfe0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d0dff0' }] },
  { featureType: 'landscape',          elementType: 'geometry',        stylers: [{ color: '#253545' }] },
]

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  scaleControl: false,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
}

const ROUTE_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444']

export default function MapView() {
  const mapRef = useRef<google.maps.Map | null>(null)
  const fittedRef = useRef(false)

  const { currentItinerary, addWaypoint, updateWaypoint, selectedWaypointId, selectWaypoint, patchCampingReservation, areaCampingsOverride, setAreaCampingsOverride, isCalculatingRoute, removePOI } = useItineraryStore()
  const { center, zoom, mode, activeOverlays, routePolyline, setMode, flyTo, selectedCampingPlaceId, setSelectedCamping, selectedTrailId, setSelectedTrail, filter, campingSearchResults, setCampingSearchResults, trailSearchResults } = useMapStore()
  const { activePanel } = useUIStore()

  // Computed: campings de l'étape sélectionnée
  const selectedWaypoint = currentItinerary?.waypoints.find(w => w.id === selectedWaypointId)
  const favoriteCampings = selectedWaypoint?.campings ?? []
  const selectedWaypointCamping = selectedWaypoint?.selectedCamping ?? null
  const favoritePlaceIds = new Set(favoriteCampings.map(c => c.placeId))
  // Résultats de recherche (campingSearchResults = source unique)
  const searchResults = campingSearchResults

  // ── "Rechercher dans cette zone" ─────────────────────────────────────────────
  const [mapMoved, setMapMoved] = useState(false)
  const [searchingArea, setSearchingArea] = useState(false)
  const initialLoadRef = useRef(true)  // ignore first load events

  // ── POI selected (modal) ─────────────────────────────────────────────────────
  const [selectedPOI, setSelectedPOI] = useState<import('../../types').Place | null>(null)

  // ── Segment routes (Option A) ─────────────────────────────────────────────
  interface SegmentRoute {
    polyline: string; distance: number; duration: number
    mode: string; fromName: string; toName: string
  }
  const [segmentRoutes, setSegmentRoutes] = useState<Record<string, SegmentRoute>>({})
  const [loadingSegmentKey, setLoadingSegmentKey] = useState<string | null>(null)
  const [activeSegment, setActiveSegment] = useState<{
    fromWp: Waypoint; toWp: Waypoint; segKey: string; mode: string
  } | null>(null)

  const fetchSegmentRoute = useCallback(async (fromWp: Waypoint, toWp: Waypoint, segKey: string, mode: string) => {
    const cacheKey = `${segKey}-${mode}`
    if (segmentRoutes[cacheKey]) return
    setLoadingSegmentKey(segKey)
    try {
      const data = await directionsApi.get(
        `${fromWp.lat},${fromWp.lng}`,
        `${toWp.lat},${toWp.lng}`,
        [],
        mode,
      )
      setSegmentRoutes(prev => ({
        ...prev,
        [cacheKey]: {
          polyline: data.polyline,
          distance: data.totalDistance,
          duration: Math.round(data.totalDuration / 60),
          mode,
          fromName: fromWp.name || fromWp.address || 'Départ',
          toName:   toWp.name   || toWp.address   || 'Arrivée',
        },
      }))
      // Persist driving route to DB so it survives page reload
      if (mode === 'driving') {
        updateWaypoint(toWp.id, {
          routePolyline: data.polyline,
          distanceFromPrev: data.totalDistance,
          durationFromPrev: Math.round(data.totalDuration / 60),
        })
      }
    } catch (e) {
      console.error('Segment route error', e)
    } finally {
      setLoadingSegmentKey(null)
    }
  }, [segmentRoutes, updateWaypoint])

  const handleSegmentClick = useCallback((fromWp: Waypoint, toWp: Waypoint, idx: number) => {
    const segKey = `${fromWp.id}-${toWp.id}`
    const mode = activeSegment?.segKey === segKey ? (activeSegment.mode) : 'driving'
    setActiveSegment({ fromWp, toWp, segKey, mode })
    fetchSegmentRoute(fromWp, toWp, segKey, mode)
  }, [activeSegment, fetchSegmentRoute])

  const handleSegmentModeChange = useCallback((mode: string) => {
    if (!activeSegment) return
    setActiveSegment(s => s ? { ...s, mode } : null)
    fetchSegmentRoute(activeSegment.fromWp, activeSegment.toWp, activeSegment.segKey, mode)
  }, [activeSegment, fetchSegmentRoute])

  // Compute visible radius (meters) from map bounds
  const getAreaParams = (): { lat: number; lng: number; radius: number } => {
    const map = mapRef.current
    if (!map) return { lat: center.lat, lng: center.lng, radius: 25000 }
    const bounds = map.getBounds()
    const mc = map.getCenter()
    if (!bounds || !mc) return { lat: center.lat, lng: center.lng, radius: 25000 }
    const lat = mc.lat()
    const lng = mc.lng()
    const ne = bounds.getNorthEast()
    const R = 6371000
    const dLat = (ne.lat() - lat) * Math.PI / 180
    const dLng = (ne.lng() - lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * Math.PI / 180) * Math.cos(ne.lat() * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    const radius = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return { lat, lng, radius: Math.min(Math.round(radius), 60000) }
  }

  const handleSearchArea = async () => {
    setSearchingArea(true)
    setMapMoved(false)
    const { lat, lng, radius } = getAreaParams()

    // Capturer les bounds AVANT la recherche pour filtrer les résultats hors-viewport
    const bounds = mapRef.current?.getBounds() ?? null

    const promises: Promise<unknown>[] = []

    if (activeOverlays.has('park4night')) {
      p4nFetchedRef.current = null
      setP4nLoading(true)
      promises.push(
        park4nightApi.nearby(lat, lng, radius)
          .then(d => {
            const places = d.places ?? []
            setP4nPlaces(bounds ? places.filter((p: { lat: number; lng: number }) => bounds.contains({ lat: p.lat, lng: p.lng })) : places)
          })
          .catch(() => setP4nPlaces([]))
          .finally(() => setP4nLoading(false))
      )
    }

    // Campings: fetch for visible area, filtrer exactement dans le viewport
    let fetchedCampings: Camping[] | null = null
    if (activeOverlays.has('campings')) {
      promises.push(
        campingsApi.nearby(lat, lng, { radius })
          .then(data => {
            const campings: Camping[] = Array.isArray(data) ? data : (data.campings ?? [])
            fetchedCampings = campings.filter(
              c => typeof c.lat === 'number' && isFinite(c.lat) &&
                   typeof c.lng === 'number' && isFinite(c.lng) &&
                   (bounds ? bounds.contains({ lat: c.lat, lng: c.lng }) : true)
            )
            setCampingSearchResults(fetchedCampings)
            setAreaCampingsOverride(fetchedCampings)  // garde le count pour la bannière
          })
          .catch(() => {})
      )
    }

    await Promise.allSettled(promises)
    setSearchingArea(false)
  }

  // ── Park4Night places ────────────────────────────────────────────────────────
  const [p4nPlaces, setP4nPlaces] = useState<P4NPlace[]>([])
  const [p4nLoading, setP4nLoading] = useState(false)
  const p4nFetchedRef = useRef<string | null>(null)  // centre de la dernière requête

  // Fetch P4N quand l'overlay est activé ou que le waypoint sélectionné change
  useEffect(() => {
    if (!activeOverlays.has('park4night')) { setP4nPlaces([]); p4nFetchedRef.current = null; return }
    const wp = (currentItinerary?.waypoints ?? []).find(w => w.id === selectedWaypointId)
    const lat = wp?.lat ?? center.lat
    const lng = wp?.lng ?? center.lng
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
    if (p4nFetchedRef.current === key) return
    p4nFetchedRef.current = key
    setP4nLoading(true)
    park4nightApi.nearby(lat, lng, 25000)
      .then(d => setP4nPlaces(d.places ?? []))
      .catch(() => setP4nPlaces([]))
      .finally(() => setP4nLoading(false))
  }, [activeOverlays, selectedWaypointId, currentItinerary, center])

  // Ref stable vers l'itinéraire courant (évite de recréer onLoad à chaque changement)
  const currentItineraryRef = useRef(currentItinerary)
  currentItineraryRef.current = currentItinerary

  const fitToWaypoints = useCallback((map: google.maps.Map, waypts: { lat: number; lng: number }[]) => {
    if (waypts.length === 1) {
      map.panTo({ lat: waypts[0].lat, lng: waypts[0].lng })
      map.setZoom(10)
    } else if (waypts.length > 1) {
      const bounds = new google.maps.LatLngBounds()
      waypts.forEach(w => bounds.extend({ lat: w.lat, lng: w.lng }))
      map.fitBounds(bounds, 80)
    }
  }, [])

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    // Centrage initial : lire via ref pour ne pas dépendre de currentItinerary
    const waypts = (currentItineraryRef.current?.waypoints ?? []).filter(
      w => w && typeof w.lat === 'number' && isFinite(w.lat) && typeof w.lng === 'number' && isFinite(w.lng)
    )
    if (waypts.length > 0) {
      fittedRef.current = true
      fitToWaypoints(map, waypts)
    }
  }, [fitToWaypoints])  // stable — pas de currentItinerary dans les deps

  // Centrage automatique quand l'itinéraire se charge APRES la carte
  useEffect(() => {
    const map = mapRef.current
    if (!map || fittedRef.current) return
    const waypts = (currentItinerary?.waypoints ?? []).filter(
      w => w && typeof w.lat === 'number' && isFinite(w.lat) && typeof w.lng === 'number' && isFinite(w.lng)
    )
    if (waypts.length > 0) {
      fittedRef.current = true
      fitToWaypoints(map, waypts)
    }
  }, [currentItinerary, fitToWaypoints])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  // Abonnement flyTo pour animation depuis autres composants
  useEffect(() => {
    return registerFlyToListener((lat, lng, targetZoom) => {
      if (!mapRef.current) return
      const map = mapRef.current
      const currentZoom = map.getZoom() ?? 10
      const finalZoom = targetZoom ?? 13

      if (currentZoom <= finalZoom - 2) {
        const startCenter = map.getCenter()
        if (!startCenter) return
        const startLat = startCenter.lat()
        const startLng = startCenter.lng()
        const startZoom = currentZoom
        // Durée proportionnelle à la distance de zoom
        const duration = Math.min(400 + (finalZoom - startZoom) * 180, 2200)
        const startTime = performance.now()

        const animate = (now: number) => {
          if (!mapRef.current) return
          const t = Math.min((now - startTime) / duration, 1)
          // Ease in-out cubic
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

          map.moveCamera({
            center: {
              lat: startLat + (lat - startLat) * ease,
              lng: startLng + (lng - startLng) * ease,
            },
            zoom: startZoom + (finalZoom - startZoom) * ease,
          })

          if (t < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
      } else {
        map.panTo({ lat, lng })
        if (finalZoom !== currentZoom) map.setZoom(finalZoom)
      }
    })
  }, [])

  // Abonnement fitBounds pour zoom région depuis autres composants
  useEffect(() => {
    return registerFitBoundsListener((points) => {
      if (!mapRef.current) return
      const map = mapRef.current
      if (points.length === 1) {
        map.panTo({ lat: points[0].lat, lng: points[0].lng })
        map.setZoom(12)
        return
      }
      const bounds = new google.maps.LatLngBounds()
      points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
      map.fitBounds(bounds, 80)
    })
  }, [])

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (mode !== 'adding-waypoint' || !e.latLng) return

    const lat = e.latLng.lat()
    const lng = e.latLng.lng()

    try {
      const data = await placesApi.reverseGeocode(lat, lng)
      const address = data.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      const name = address.split(',')[0]
      await addWaypoint({ lat, lng, address, name, nights: 1 })
      setMode('idle')
    } catch {
      await addWaypoint({ lat, lng, name: `Étape ${(currentItinerary?.waypoints?.length ?? 0) + 1}`, nights: 1 })
      setMode('idle')
    }
  }, [mode, addWaypoint, currentItinerary?.waypoints?.length, setMode])

  // Décodage du polyline de route
  const routePath = routePolyline
    ? google.maps.geometry.encoding.decodePath(routePolyline).map(p => ({ lat: p.lat(), lng: p.lng() }))
    : null

  const waypoints = (currentItinerary?.waypoints ?? []).filter(Boolean)
  const selectedCampings = (selectedWaypointId
    ? (waypoints.find(w => w.id === selectedWaypointId)?.campings ?? [])
    : []
  ).filter(c => typeof c.lat === 'number' && isFinite(c.lat) && typeof c.lng === 'number' && isFinite(c.lng))
  const selectedTrails = selectedWaypointId
    ? (waypoints.find(w => w.id === selectedWaypointId)?.trails ?? [])
    : []

  const mapOptions = {
    ...MAP_OPTIONS,
    draggableCursor: mode === 'adding-waypoint' ? 'crosshair' : undefined,
    draggingCursor:  mode === 'adding-waypoint' ? 'crosshair' : undefined,
  }

  return (
    <div className={`relative w-full h-full${mode === 'adding-waypoint' ? ' cursor-crosshair' : ''}`}>
      <GoogleMap
        mapContainerClassName="w-full h-full"
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={handleMapClick}
        onDragEnd={() => {
          if (initialLoadRef.current) { initialLoadRef.current = false; return }
          if (activeOverlays.has('campings') || activeOverlays.has('park4night') || activeOverlays.has('trails'))
            setMapMoved(true)
        }}
        onZoomChanged={() => {
          if (initialLoadRef.current) return
          if (activeOverlays.has('campings') || activeOverlays.has('park4night') || activeOverlays.has('trails'))
            setMapMoved(true)
        }}
      >
        {/* ── Route polyline ──────────────────────────── */}
        {routePath && (
          <Polyline
            path={routePath}
            options={{
              strokeColor: '#f59e0b',
              strokeOpacity: 0.85,
              strokeWeight: 4,
              icons: [{
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4, fillColor: '#f59e0b', fillOpacity: 1 },
                offset: '50%',
                repeat: '120px',
              }],
            }}
          />
        )}

        {/* ── Segments individuels colorés (cliquables) ──── */}
        {waypoints.length > 1 && !routePath && waypoints.slice(0, -1).map((wp, i) => {
          const next     = waypoints[i + 1]
          const segKey   = `${wp.id}-${next.id}`
          const isActive = activeSegment?.segKey === segKey
          const cacheKey = `${segKey}-${activeSegment?.mode ?? 'driving'}`
          // Priorité : route on-demand (mode switcher) > route DB (driving) > ligne droite
          // On-demand route persists even when modal is closed (uses driving cache when no active segment)
          const onDemandRoute = segmentRoutes[cacheKey] ?? null
          const dbPolylineStr = next.routePolyline ?? null
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length]

          const activePath = onDemandRoute
            ? google.maps.geometry.encoding.decodePath(onDemandRoute.polyline).map(p => ({ lat: p.lat(), lng: p.lng() }))
            : dbPolylineStr
              ? google.maps.geometry.encoding.decodePath(dbPolylineStr).map(p => ({ lat: p.lat(), lng: p.lng() }))
              : null

          return (
            <span key={`seg-${wp.id}`}>
              {/* Ligne de fond cliquable (toujours visible) */}
              <Polyline
                path={activePath ?? [{ lat: wp.lat, lng: wp.lng }, { lat: next.lat, lng: next.lng }]}
                options={{
                  strokeColor:   color,
                  strokeOpacity: activePath ? (isActive ? 0.9 : 0.75) : 0.4,
                  strokeWeight:  activePath ? 5 : 3,
                  clickable: true,
                  zIndex: 1,
                  icons: activePath ? [{
                    icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.5, fillColor: color, fillOpacity: 1 },
                    offset: '50%',
                    repeat: '100px',
                  }] : [],
                }}
                onClick={() => handleSegmentClick(wp, next, i)}
              />
            </span>
          )
        })}

        {/* ── Waypoint markers ───────────────────────── */}
        {waypoints.map((wp, i) => (
          <WaypointMarker
            key={wp.id}
            waypoint={wp}
            index={i}
            isSelected={wp.id === selectedWaypointId}
            onSelect={() => {
              selectWaypoint(wp.id === selectedWaypointId ? null : wp.id)
              flyTo(wp.lat, wp.lng, 12)
            }}
          />
        ))}

        {/* ── Camping sélectionné pour l'étape ────────── */}
        {selectedWaypointCamping && (
          <CampingMarker
            key={`sel-${selectedWaypointCamping.placeId}`}
            camping={selectedWaypointCamping}
            isSelected={true}
            variant="selected"
            isFavorite={favoritePlaceIds.has(selectedWaypointCamping.placeId)}
            onSelect={() => {}}
            onToggleSelected={selectedWaypointId ? () =>
              updateWaypoint(selectedWaypointId, { selectedCamping: null })
            : undefined}
            onToggleFavorite={selectedWaypointId ? () => {
              const { addFavoriteCamping, removeFavoriteCamping } = useItineraryStore.getState()
              favoritePlaceIds.has(selectedWaypointCamping.placeId)
                ? removeFavoriteCamping(selectedWaypointId, selectedWaypointCamping.placeId!)
                : addFavoriteCamping(selectedWaypointId, selectedWaypointCamping)
            } : undefined}
            onReservationChecked={info => {
              if (selectedWaypointId && selectedWaypointCamping.placeId)
                patchCampingReservation(selectedWaypointId, selectedWaypointCamping.placeId, info)
            }}
          />
        )}

        {/* ── Campings favoris de l'étape ──────────────── */}
        {filter.p4nTypes.length === 0 && favoriteCampings
          .filter(c => c.placeId !== selectedWaypointCamping?.placeId)
          .map(c => (
            <CampingMarker
              key={`fav-${c.placeId}`}
              camping={c}
              isSelected={selectedWaypointCamping?.placeId === c.placeId}
              variant="favorite"
              isFavorite={true}
              onSelect={() => setSelectedCamping(c.placeId === selectedCampingPlaceId ? null : c.placeId)}
              onToggleSelected={selectedWaypointId ? () =>
                updateWaypoint(selectedWaypointId, { selectedCamping: c })
              : undefined}
              onToggleFavorite={selectedWaypointId ? () => {
                const { removeFavoriteCamping } = useItineraryStore.getState()
                removeFavoriteCamping(selectedWaypointId, c.placeId!)
              } : undefined}
              onReservationChecked={info => {
                if (selectedWaypointId && c.placeId)
                  patchCampingReservation(selectedWaypointId, c.placeId, info)
              }}
            />
          ))}

        {/* ── Résultats de recherche camping ───────────── */}
        {activeOverlays.has('campings') && filter.p4nTypes.length === 0 && searchResults
          .filter(c => c.placeId !== selectedWaypointCamping?.placeId && !favoritePlaceIds.has(c.placeId))
          .map(c => (
            <CampingMarker
              key={`srch-${c.placeId}`}
              camping={c}
              isSelected={selectedWaypointCamping?.placeId === c.placeId}
              variant="search"
              isFavorite={false}
              onSelect={() => {
                const next = c.placeId === selectedCampingPlaceId ? null : c.placeId
                setSelectedCamping(next)
              }}
              onToggleSelected={selectedWaypointId ? () =>
                updateWaypoint(selectedWaypointId, { selectedCamping: c })
              : undefined}
              onToggleFavorite={selectedWaypointId ? () => {
                const { addFavoriteCamping } = useItineraryStore.getState()
                addFavoriteCamping(selectedWaypointId, c)
              } : undefined}
              onReservationChecked={info => {
                if (selectedWaypointId && c.placeId)
                  patchCampingReservation(selectedWaypointId, c.placeId, info)
              }}
            />
          ))}

        {/* ── Park4Night markers ───────────────────────── */}
        {activeOverlays.has('park4night') && p4nPlaces
          .filter(p => filter.p4nTypes.length === 0 || filter.p4nTypes.includes(p.typeId))
          .map(p => (
            <Park4NightMarker key={p.id} place={p} />
          ))}

        {/* ── Trail overlays favoris (toujours visibles si étape sélectionnée) ── */}
        {selectedTrails.map(t => (
          <TrailOverlay
            key={`fav-${t.id}`}
            trail={t}
            isFavorite={true}
            isSelected={t.id === selectedTrailId}
            onSelect={() => setSelectedTrail(t.id === selectedTrailId ? null : t.id)}
          />
        ))}

        {/* ── Trail overlays résultats de recherche (calque actif) ──────────── */}
        {activeOverlays.has('trails') && trailSearchResults
          .filter(t => !selectedTrails.some(s => s.id === t.id))
          .map(t => (
            <TrailOverlay
              key={`search-${t.id}`}
              trail={t}
              isFavorite={false}
              isSelected={t.id === selectedTrailId}
              onSelect={() => setSelectedTrail(t.id === selectedTrailId ? null : t.id)}
            />
          ))}

        {/* ── POI markers ─────────────────────────── */}
        {selectedWaypointId && (
          (waypoints.find(w => w.id === selectedWaypointId)?.pois ?? []).map(poi => (
            <POIMarker
              key={poi.placeId}
              place={poi}
              isSelected={selectedPOI?.placeId === poi.placeId}
              onClick={p => setSelectedPOI(prev => prev?.placeId === p.placeId ? null : p)}
            />
          ))
        )}


      </GoogleMap>

      {/* ── Contrôles cartographiques ─────────────── */}
      <MapControls mapRef={mapRef} p4nLoading={p4nLoading} />

      {/* ── Indicateur recalcul route ────────────── */}
      <AnimatePresence>
        {isCalculatingRoute && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute top-4 right-16 z-20
                       bg-card border border-accent/40 shadow-lg
                       text-xs text-slate-200 px-3 py-1.5 rounded-full flex items-center gap-2"
          >
            <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin shrink-0" />
            Calcul des routes…
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rechercher dans cette zone ─────────────── */}
      <AnimatePresence>
        {mapMoved && !searchingArea && (
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onClick={handleSearchArea}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                       bg-card border border-border/60 shadow-lg
                       text-sm font-medium text-slate-100
                       px-4 py-2 rounded-full flex items-center gap-2
                       hover:bg-card/80 active:scale-95 transition-transform"
          >
            <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            Rechercher dans cette zone
          </motion.button>
        )}
        {searchingArea && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                       bg-card border border-border/60 shadow-lg
                       text-sm text-muted px-4 py-2 rounded-full flex items-center gap-2"
          >
            <span className="w-3.5 h-3.5 border border-accent border-t-transparent rounded-full animate-spin" />
            Recherche en cours…
          </motion.div>
        )}
        {/* Badge résultats zone */}
        {areaCampingsOverride !== null && !mapMoved && !searchingArea && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10
                       bg-card border border-accent/40 shadow-lg
                       text-xs text-slate-300 px-3 py-1.5 rounded-full flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-accent/70" />
            {areaCampingsOverride.length} camping{areaCampingsOverride.length > 1 ? 's' : ''} trouvé{areaCampingsOverride.length > 1 ? 's' : ''} — déplacez la carte pour en chercher d'autres
            <button
              onClick={() => setAreaCampingsOverride(null)}
              className="text-muted hover:text-slate-100 ml-1 leading-none"
              title="Réinitialiser"
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panneau info segment (Option A) ─────────── */}
      <AnimatePresence>
        {activeSegment && (() => {
          const cacheKey  = `${activeSegment.segKey}-${activeSegment.mode}`
          const segRoute  = segmentRoutes[cacheKey]
          const isLoading = loadingSegmentKey === activeSegment.segKey
          const MODES = [
            { id: 'driving',   icon: '🚗', label: 'Voiture' },
            { id: 'bicycling', icon: '🚴', label: 'Vélo'    },
            { id: 'walking',   icon: '🚶', label: 'Marche'  },
          ]
          return (
            <motion.div
              key="segment-panel"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-6 right-4 z-20 w-72
                         bg-card border border-border/70 rounded-xl shadow-xl
                         text-slate-100 text-sm overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/80">
                <span className="font-semibold text-xs text-accent truncate">
                  {activeSegment.fromWp.name} → {activeSegment.toWp.name}
                </span>
                <button
                  onClick={() => setActiveSegment(null)}
                  className="text-muted hover:text-slate-100 ml-2 shrink-0"
                >✕</button>
              </div>

              {/* Mode switcher */}
              <div className="flex gap-1 px-3 py-2 border-b border-border/40">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSegmentModeChange(m.id)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1 px-1 rounded-lg text-xs transition-colors
                      ${activeSegment.mode === m.id
                        ? 'bg-accent/20 text-accent font-semibold border border-accent/40'
                        : 'text-muted hover:text-slate-100 hover:bg-white/5 border border-transparent'
                      }`}
                  >
                    <span className="text-base leading-none">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Résultat */}
              <div className="px-3 py-3 flex items-center justify-center min-h-[52px]">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted text-xs">
                    <span className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin" />
                    Calcul en cours…
                  </div>
                ) : segRoute ? (
                  <div className="flex gap-6 justify-center w-full">
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-100">{segRoute.distance.toFixed(1)} <span className="text-xs font-normal text-muted">km</span></div>
                      <div className="text-xs text-muted">Distance</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-100">
                        {segRoute.duration >= 60
                          ? `${Math.floor(segRoute.duration / 60)}h${String(segRoute.duration % 60).padStart(2, '0')}`
                          : `${segRoute.duration} min`
                        }
                      </div>
                      <div className="text-xs text-muted">Durée</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted">Cliquez sur un segment pour voir la route</span>
                )}
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Modal POI ────────────────────────────── */}
      <AnimatePresence>
        {selectedPOI && (
          <motion.div
            key="poi-modal"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-6 left-4 z-20 w-64
                       bg-card border border-purple-500/40 rounded-xl shadow-xl
                       text-slate-100 text-sm overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/80">
              <span className="font-semibold text-xs text-purple-300 truncate flex items-center gap-1.5">
                <Navigation className="w-3 h-3 shrink-0" />{selectedPOI.name}
              </span>
              <button onClick={() => setSelectedPOI(null)} className="text-muted hover:text-slate-100 ml-2 shrink-0">✕</button>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {selectedPOI.address && (
                <p className="text-xs text-muted">{selectedPOI.address}</p>
              )}
              {selectedPOI.rating && (
                <p className="text-xs text-yellow-400">★ {selectedPOI.rating}</p>
              )}
              <div className="flex gap-2 pt-1">
                {selectedPOI.website && (
                  <a href={selectedPOI.website} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center py-1 text-xs rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-200 transition-colors flex items-center justify-center gap-1">
                    <Layers className="w-3 h-3" />Site web
                  </a>
                )}
                {selectedWaypointId && (
                  <button
                    onClick={() => { removePOI(selectedWaypointId, selectedPOI.placeId); setSelectedPOI(null) }}
                    className="flex-1 py-1 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors">
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Indicateur de mode ───────────────────── */}
      <AnimatePresence>
        {mode !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10
                       bg-accent text-slate-900 font-semibold text-sm
                       px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            {mode === 'adding-waypoint' && 'Cliquez sur la carte pour ajouter une étape'}
            {mode === 'selecting-camping' && 'Cliquez sur un camping pour le sélectionner'}
            <button
              onClick={() => setMode('idle')}
              className="ml-2 text-slate-900/70 hover:text-slate-900 text-xs underline"
            >
              Annuler
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Contrôles zoom + localisation ──────────────────────────────────────────────
function MapControls({ mapRef, p4nLoading }: { mapRef: React.RefObject<google.maps.Map | null>; p4nLoading?: boolean }) {
  const { setMode, mode, toggleOverlay, activeOverlays } = useMapStore()
  const [satellite, setSatellite] = useState(false)

  const toggleSatellite = () => {
    const next = !satellite
    setSatellite(next)
    mapRef.current?.setMapTypeId(next ? 'satellite' : 'roadmap')
  }

  const zoomIn  = () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 10) + 1)
  const zoomOut = () => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 10) - 1)

  const geolocate = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      mapRef.current?.panTo({ lat, lng })
      mapRef.current?.setZoom(13)
    })
  }

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
      <div className="card flex flex-col overflow-hidden">
        <button onClick={zoomIn}  className="btn-ghost px-3 py-2 text-lg font-light border-b border-border/30">+</button>
        <button onClick={zoomOut} className="btn-ghost px-3 py-2 text-lg font-light">−</button>
      </div>
      <button onClick={geolocate} className="card btn-ghost p-2" title="Ma position">
        <Crosshair className="w-4 h-4 text-muted hover:text-slate-100" />
      </button>
      <button
        onClick={() => setMode(mode === 'adding-waypoint' ? 'idle' : 'adding-waypoint')}
        className={`card p-2 ${mode === 'adding-waypoint' ? 'text-accent' : 'text-muted'} hover:text-slate-100 transition-colors`}
        title="Ajouter une étape"
      >
        <MapPin className="w-4 h-4" />
      </button>
      <button
        onClick={() => toggleOverlay('campings')}
        className={`card p-2 ${activeOverlays.has('campings') ? 'text-accent' : 'text-muted'} hover:text-slate-100 transition-colors`}
        title="Afficher les campings"
      >
        <Layers className="w-4 h-4" />
      </button>
      <button
        onClick={() => toggleOverlay('trails')}
        className={`card p-2 ${activeOverlays.has('trails') ? 'text-green-400' : 'text-muted'} hover:text-slate-100 transition-colors`}
        title="Afficher les randonnées"
      >
        <Navigation className="w-4 h-4" />
      </button>
      <button
        onClick={() => toggleOverlay('park4night')}
        className={`card p-2 ${activeOverlays.has('park4night') ? 'text-indigo-400' : 'text-muted'} hover:text-slate-100 transition-colors relative`}
        title="Afficher les lieux Park4Night"
      >
        {p4nLoading
          ? <span className="w-4 h-4 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
          : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px] font-bold">P</span>
        }
      </button>
      <button
        onClick={toggleSatellite}
        className={`card p-2 ${satellite ? 'text-yellow-400' : 'text-muted'} hover:text-slate-100 transition-colors`}
        title="Vue satellite"
      >
        <Satellite className="w-4 h-4" />
      </button>
    </div>
  )
}
