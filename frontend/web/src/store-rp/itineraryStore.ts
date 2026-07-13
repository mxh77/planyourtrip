import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Itinerary, Waypoint, ItineraryPreferences, Camping, Trail, Place } from '../types'
import { itineraryApi, directionsApi } from '../services/api'
import { useMapStore } from './mapStore'

interface ItineraryState {
  // Liste de tous les itinéraires
  itineraries: Itinerary[]
  // Itinéraire actif
  currentItinerary: Itinerary | null
  // Étape sélectionnée dans la sidebar/map
  selectedWaypointId: string | null
  // Chargement
  isLoading: boolean
  isSaving: boolean
  isCalculatingRoute: boolean

  // Actions — Itinéraires
  loadItineraries: () => Promise<void>
  loadItinerary:   (id: string) => Promise<void>
  createItinerary: (name: string, preferences?: Partial<ItineraryPreferences>) => Promise<Itinerary>
  updateItinerary: (id: string, data: Partial<Pick<Itinerary, 'name' | 'description' | 'preferences'>>) => Promise<void>
  deleteItinerary: (id: string) => Promise<void>
  setCurrentItinerary: (itinerary: Itinerary | null) => void

  // Actions — Étapes
  addWaypoint:    (data: Partial<Waypoint>) => Promise<Waypoint>
  updateWaypoint: (waypointId: string, data: Partial<Waypoint>) => Promise<void>
  deleteWaypoint: (waypointId: string) => Promise<void>
  reorderWaypoints: (newOrder: Waypoint[]) => Promise<void>
  selectWaypoint: (id: string | null) => void

  // Résultats de recherche zone (non persistés en DB)
  areaCampingsOverride: Camping[] | null
  setAreaCampingsOverride: (campings: Camping[] | null) => void

  // Actions — Campings (local only)
  patchCampingReservation: (waypointId: string, placeId: string, info: import('../types').ReservationInfo) => void

  // Actions — Favoris campings
  addFavoriteCamping: (waypointId: string, camping: Camping) => Promise<void>
  removeFavoriteCamping: (waypointId: string, campingId: string) => Promise<void>

  // Actions — Favoris randonnées
  addFavoriteTrail: (waypointId: string, trail: Trail) => Promise<void>
  removeFavoriteTrail: (waypointId: string, trailId: string) => Promise<void>

  // Actions — Points d'intérêt
  addPOI: (waypointId: string, place: Place) => Promise<void>
  removePOI: (waypointId: string, placeId: string) => Promise<void>

  // Actions — Route
  calculateRoute: () => Promise<void>
  setIsCalculatingRoute: (v: boolean) => void

  // Actions — Sync depuis socket
  handleSocketUpdate: (itinerary: Itinerary) => void
  handleWaypointAdded:   (wp: Waypoint) => void
  handleWaypointUpdated: (wp: Waypoint) => void
  handleWaypointDeleted: (wpId: string) => void
}

export const useItineraryStore = create<ItineraryState>()(
  devtools(
    persist(
      (set, get) => ({
        itineraries: [],
        currentItinerary: null,
        selectedWaypointId: null,
        areaCampingsOverride: null,
        isLoading: false,
        isSaving: false,
        isCalculatingRoute: false,

        loadItineraries: async () => {
          set({ isLoading: true })
          try {
            const data = await itineraryApi.list()
            set({ itineraries: Array.isArray(data) ? data : [], isLoading: false })
          } catch (e) {
            console.error('[loadItineraries] erreur:', e)
            set({ isLoading: false })
          }
        },

        loadItinerary: async (id) => {
          set({ isLoading: true })
          try {
            const data = await itineraryApi.get(id)
            set({ currentItinerary: data.itinerary ?? data })
          } finally {
            set({ isLoading: false })
          }
        },

        createItinerary: async (name, preferences) => {
          set({ isSaving: true })
          try {
            const data = await itineraryApi.create({ name, preferences })
            const raw = data.itinerary ?? data
            // Ensure waypoints is always an array (API may omit it on a fresh itinerary)
            const it = { ...raw, waypoints: raw.waypoints ?? [] }
            set(s => ({ itineraries: [it, ...(s.itineraries ?? [])], currentItinerary: it }))
            return it
          } finally {
            set({ isSaving: false })
          }
        },

        updateItinerary: async (id, updates) => {
          set({ isSaving: true })
          try {
            const data = await itineraryApi.update(id, updates)
            const updated = data.itinerary ?? data
            set(s => ({
              itineraries: (s.itineraries ?? []).map(i => i.id === id ? updated : i),
              currentItinerary: s.currentItinerary?.id === id ? updated : s.currentItinerary,
            }))
          } finally {
            set({ isSaving: false })
          }
        },

        deleteItinerary: async (id) => {
          await itineraryApi.delete(id)
          set(s => ({
            itineraries: (s.itineraries ?? []).filter(i => i.id !== id),
            currentItinerary: s.currentItinerary?.id === id ? null : s.currentItinerary,
          }))
        },

        setCurrentItinerary: (itinerary) => set({ currentItinerary: itinerary, selectedWaypointId: null }),

        addWaypoint: async (data) => {
          const { currentItinerary } = get()
          if (!currentItinerary) throw new Error('Aucun itinéraire actif')
          set({ isSaving: true })
          try {
            const res = await itineraryApi.addWaypoint(currentItinerary.id, data)
            const wp: Waypoint = res.waypoint ?? res
            // Le socket waypoint:added met à jour le state — on évite le doublon
            // Fallback si pas de socket : on ajoute manuellement seulement si absent
            set(s => {
              if (!s.currentItinerary) return {}
              const exists = s.currentItinerary.waypoints.some(w => w.id === wp.id)
              if (exists) return {}
              return {
                currentItinerary: {
                  ...s.currentItinerary,
                  waypoints: [...s.currentItinerary.waypoints, wp]
                    .filter(Boolean)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
                },
              }
            })
            return wp
          } finally {
            set({ isSaving: false })
          }
        },

        patchCampingReservation: (waypointId, placeId, info) => {
          set(s => {
            if (!s.currentItinerary) return {}
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: s.currentItinerary.waypoints.map(w =>
                  w.id !== waypointId ? w : {
                    ...w,
                    campings: (w.campings ?? []).map(c =>
                      c.placeId === placeId ? { ...c, reservationInfo: info } : c
                    ),
                  }
                ),
              },
            }
          })
        },

        addFavoriteCamping: async (waypointId, camping) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          const already = (wp.campings ?? []).some(c => c.placeId === camping.placeId)
          if (already) return
          const newFavorites = [...(wp.campings ?? []), camping]
          // Optimistic update
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, campings: newFavorites } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { campings: newFavorites })
        },

        removeFavoriteCamping: async (waypointId, campingId) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          const newFavorites = (wp.campings ?? []).filter(c => c.placeId !== campingId)
          // Optimistic update
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, campings: newFavorites } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { campings: newFavorites })
        },

        addFavoriteTrail: async (waypointId, trail) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          const already = (wp.trails ?? []).some(t => t.id === trail.id)
          if (already) return
          const newFavorites = [...(wp.trails ?? []), trail]
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, trails: newFavorites } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { trails: newFavorites })
        },

        removeFavoriteTrail: async (waypointId, trailId) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          const newFavorites = (wp.trails ?? []).filter(t => t.id !== trailId)
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, trails: newFavorites } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { trails: newFavorites })
        },

        addPOI: async (waypointId, place) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          if ((wp.pois ?? []).some(p => p.placeId === place.placeId)) return
          const newPOIs = [...(wp.pois ?? []), place]
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, pois: newPOIs } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { pois: newPOIs })
        },

        removePOI: async (waypointId, placeId) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const wp = currentItinerary.waypoints.find(w => w.id === waypointId)
          if (!wp) return
          const newPOIs = (wp.pois ?? []).filter(p => p.placeId !== placeId)
          set(s => ({
            currentItinerary: s.currentItinerary ? {
              ...s.currentItinerary,
              waypoints: s.currentItinerary.waypoints.map(w =>
                w.id === waypointId ? { ...w, pois: newPOIs } : w
              ),
            } : null,
          }))
          await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, { pois: newPOIs })
        },

        updateWaypoint: async (waypointId, data) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          set({ isSaving: true })
          try {
            const res = await itineraryApi.updateWaypoint(currentItinerary.id, waypointId, data)
            const updated: Waypoint = res.waypoint ?? res
            set(s => {
              if (!s.currentItinerary) return {}
              // Preserve local-only reservationInfo on campings (server doesn't know about it)
              const localWp = s.currentItinerary.waypoints.find(w => w.id === waypointId)
              const mergedCampings = updated.campings?.map(c => {
                const local = localWp?.campings?.find(lc => lc.placeId === c.placeId)
                return local?.reservationInfo ? { ...c, reservationInfo: local.reservationInfo } : c
              })
              return {
                currentItinerary: {
                  ...s.currentItinerary,
                  waypoints: s.currentItinerary.waypoints.map(w =>
                    w.id === waypointId ? { ...updated, campings: mergedCampings ?? updated.campings } : w
                  ),
                },
              }
            })
          } finally {
            set({ isSaving: false })
          }
        },

        deleteWaypoint: async (waypointId) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          await itineraryApi.deleteWaypoint(currentItinerary.id, waypointId)
          set(s => {
            if (!s.currentItinerary) return {}
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: s.currentItinerary.waypoints.filter(w => w.id !== waypointId),
              },
              selectedWaypointId: s.selectedWaypointId === waypointId ? null : s.selectedWaypointId,
            }
          })
        },

        reorderWaypoints: async (newOrder) => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          const orderPayload = newOrder.map((wp, i) => ({ id: wp.id, order: i + 1 }))
          // Optimistic update
          set(s => {
            if (!s.currentItinerary) return {}
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: newOrder.map((wp, i) => ({ ...wp, order: i + 1 })),
              },
            }
          })
          await itineraryApi.reorderWaypoints(currentItinerary.id, orderPayload)
        },

        selectWaypoint: (id) => set({ selectedWaypointId: id, areaCampingsOverride: null }),

        setAreaCampingsOverride: (campings) => set({ areaCampingsOverride: campings }),

        setIsCalculatingRoute: (v) => set({ isCalculatingRoute: v }),

        calculateRoute: async () => {
          const { currentItinerary } = get()
          if (!currentItinerary) return
          set({ isCalculatingRoute: true })
          try {
            // Lance le recalcul côté backend (async — résultat via socket waypoint:updated)
            await directionsApi.calculateForItinerary(currentItinerary.id)
            // isCalculatingRoute sera remis à false par l'événement route:calculated
          } catch {
            set({ isCalculatingRoute: false })
          }
        },

        // Socket handlers
        handleSocketUpdate: (itinerary) => {
          set(s => {
            if (s.currentItinerary?.id !== itinerary.id) {
              return {
                itineraries: (s.itineraries ?? []).map(i => i.id === itinerary.id ? itinerary : i),
              }
            }
            // Preserve local reservationInfo on campings
            const mergedWaypoints = itinerary.waypoints.map(wp => {
              const local = s.currentItinerary!.waypoints.find(w => w.id === wp.id)
              const mergedCampings = wp.campings?.map(c => {
                const lc = local?.campings?.find(l => l.placeId === c.placeId)
                return lc?.reservationInfo ? { ...c, reservationInfo: lc.reservationInfo } : c
              })
              return { ...wp, campings: mergedCampings ?? wp.campings }
            })
            return {
              currentItinerary: { ...itinerary, waypoints: mergedWaypoints },
              itineraries: (s.itineraries ?? []).map(i => i.id === itinerary.id ? itinerary : i),
            }
          })
        },
        handleWaypointAdded: (wp) => {
          set(s => {
            if (!s.currentItinerary) return {}
            const exists = s.currentItinerary.waypoints.some(w => w.id === wp.id)
            if (exists) return {}
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: [...s.currentItinerary.waypoints, wp]
                  .filter(Boolean)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
              },
            }
          })
        },
        handleWaypointUpdated: (wp) => {
          set(s => {
            if (!s.currentItinerary) return {}
            // Preserve local reservationInfo on campings
            const local = s.currentItinerary.waypoints.find(w => w.id === wp.id)
            const mergedCampings = wp.campings?.map(c => {
              const lc = local?.campings?.find(l => l.placeId === c.placeId)
              return lc?.reservationInfo ? { ...c, reservationInfo: lc.reservationInfo } : c
            })
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: s.currentItinerary.waypoints.map(w =>
                  w.id === wp.id ? { ...wp, campings: mergedCampings ?? wp.campings } : w
                ),
              },
            }
          })
        },
        handleWaypointDeleted: (wpId) => {
          set(s => {
            if (!s.currentItinerary) return {}
            return {
              currentItinerary: {
                ...s.currentItinerary,
                waypoints: s.currentItinerary.waypoints.filter(w => w.id !== wpId),
              },
            }
          })
        },
      }),
      {
        name: 'roadtrip-itinerary',
        partialize: (s) => ({
          itineraries: s.itineraries,
          currentItinerary: s.currentItinerary,
        }),
        merge: (persisted, current) => {
          const p = persisted as Partial<ItineraryState>
          const ci = p?.currentItinerary
          return {
            ...current,
            ...p,
            itineraries: (p?.itineraries ?? []).filter(Boolean),
            currentItinerary: ci
              ? { ...ci, waypoints: (ci.waypoints ?? []).filter(Boolean) }
              : null,
          }
        },
      }
    )
  )
)
