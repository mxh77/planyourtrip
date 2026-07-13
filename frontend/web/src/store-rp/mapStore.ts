import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MapMode, OverlayType, MapFilter, LatLng, Camping, Trail } from '../types'

interface MapState {
  center: LatLng
  zoom: number
  mode: MapMode
  activeOverlays: Set<OverlayType>
  filter: MapFilter
  routePolyline: string | null
  hoveredWaypointId: string | null
  isStreetView: boolean
  selectedCampingPlaceId: string | null
  hoveredCampingId: string | null
  selectedTrailId: string | null
  // Résultats de recherche camping (non persistés — affichés sur la carte)
  campingSearchResults: Camping[]
  // Résultats de recherche sentiers (non persistés — affichés sur la carte)
  trailSearchResults: Trail[]

  // Actions
  setCenter: (center: LatLng, zoom?: number) => void
  setZoom:   (zoom: number) => void
  setMode:   (mode: MapMode) => void
  toggleOverlay: (overlay: OverlayType) => void
  setFilter: (filter: Partial<MapFilter>) => void
  resetFilter: () => void
  setRoutePolyline: (polyline: string | null) => void
  setHoveredWaypoint: (id: string | null) => void
  toggleStreetView: () => void
  flyTo: (lat: number, lng: number, zoom?: number) => void
  fitBounds: (points: { lat: number; lng: number }[]) => void
  setSelectedCamping: (placeId: string | null) => void
  setHoveredCamping: (id: string | null) => void
  setSelectedTrail: (id: string | null) => void
  setCampingSearchResults: (campings: Camping[]) => void
  setTrailSearchResults: (trails: Trail[]) => void
}

const DEFAULT_FILTER: MapFilter = {
  minRating: 0,
  maxDistance: 50,
  trailMaxDistance: 20,
  poiMaxDistance: 20,
  requireParking: false,
  requirePool: false,
  requireWifi: false,
  vehicleTypes: [],
  trailDifficulty: [],
  p4nTypes: [],
}

// Permettre au composant Map de s'y abonner pour appeler map.panTo()
type FlyToListener = (lat: number, lng: number, zoom?: number) => void
const flyToListeners: FlyToListener[] = []
export function registerFlyToListener(fn: FlyToListener) {
  flyToListeners.push(fn)
  return () => { const i = flyToListeners.indexOf(fn); if (i >= 0) flyToListeners.splice(i, 1) }
}

// Permettre au composant Map de s'y abonner pour appeler map.fitBounds()
type FitBoundsListener = (points: { lat: number; lng: number }[]) => void
const fitBoundsListeners: FitBoundsListener[] = []
export function registerFitBoundsListener(fn: FitBoundsListener) {
  fitBoundsListeners.push(fn)
  return () => { const i = fitBoundsListeners.indexOf(fn); if (i >= 0) fitBoundsListeners.splice(i, 1) }
}

export const useMapStore = create<MapState>()(
  devtools(
    (set) => ({
      center: { lat: 46.2276, lng: 2.2137 },
      zoom: 6,
      mode: 'idle',
      activeOverlays: new Set(),
      filter: DEFAULT_FILTER,
      routePolyline: null,
      hoveredWaypointId: null,
      isStreetView: false,
      selectedCampingPlaceId: null,
      hoveredCampingId: null,
      selectedTrailId: null,
      campingSearchResults: [],
      trailSearchResults: [],

      setCenter: (center, zoom) =>
        set(s => ({ center, zoom: zoom ?? s.zoom })),

      setZoom: (zoom) => set({ zoom }),

      setMode: (mode) => set({ mode }),

      toggleOverlay: (overlay) =>
        set(s => {
          const next = new Set(s.activeOverlays)
          next.has(overlay) ? next.delete(overlay) : next.add(overlay)
          return { activeOverlays: next }
        }),

      setFilter: (partial) =>
        set(s => ({ filter: { ...s.filter, ...partial } })),

      resetFilter: () => set({ filter: DEFAULT_FILTER }),

      setRoutePolyline: (polyline) => set({ routePolyline: polyline }),

      setHoveredWaypoint: (id) => set({ hoveredWaypointId: id }),

      toggleStreetView: () => set(s => ({ isStreetView: !s.isStreetView })),

      setSelectedCamping: (placeId) => set({ selectedCampingPlaceId: placeId }),

      setHoveredCamping: (id) => set({ hoveredCampingId: id }),

      setSelectedTrail: (id) => set({ selectedTrailId: id }),

      setCampingSearchResults: (campings) => set({ campingSearchResults: campings }),
      setTrailSearchResults: (trails) => set({ trailSearchResults: trails }),

      flyTo: (lat, lng, zoom) => {
        set({ center: { lat, lng }, zoom: zoom ?? 13 })
        flyToListeners.forEach(fn => fn(lat, lng, zoom))
      },

      fitBounds: (points) => {
        if (points.length === 0) return
        if (points.length === 1) {
          const p = points[0]
          set({ center: { lat: p.lat, lng: p.lng }, zoom: 12 })
        }
        fitBoundsListeners.forEach(fn => fn(points))
      },
    })
  )
)
