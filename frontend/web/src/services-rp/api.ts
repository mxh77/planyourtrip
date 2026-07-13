import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''
const api = axios.create({
  baseURL: API_BASE ? `${API_BASE}/api` : '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Intercepteur d'erreurs ────────────────────────────────────────────────────
api.interceptors.response.use(
  r => r,
  err => {
    const message = err.response?.data?.error || err.message || 'Erreur réseau'
    return Promise.reject(Object.assign(err, { userMessage: message }))
  }
)

export default api

// ── Itinéraires ───────────────────────────────────────────────────────────────

export const itineraryApi = {
  list:    ()                => api.get('/itineraries').then(r => r.data),
  get:     (id: string)      => api.get(`/itineraries/${id}`).then(r => r.data),
  create:  (data: object)    => api.post('/itineraries', data).then(r => r.data),
  update:  (id: string, d: object) => api.patch(`/itineraries/${id}`, d).then(r => r.data),
  delete:  (id: string)      => api.delete(`/itineraries/${id}`),

  addWaypoint:    (id: string, wp: object)  => api.post(`/itineraries/${id}/waypoints`, wp).then(r => r.data),
  updateWaypoint: (id: string, wpId: string, d: object) =>
    api.patch(`/itineraries/${id}/waypoints/${wpId}`, d).then(r => r.data),
  deleteWaypoint: (id: string, wpId: string) =>
    api.delete(`/itineraries/${id}/waypoints/${wpId}`),
  reorderWaypoints: (id: string, order: {id: string; order: number}[]) =>
    api.put(`/itineraries/${id}/waypoints/reorder`, { order }).then(r => r.data),
}

// ── Places ────────────────────────────────────────────────────────────────────

export const placesApi = {
  autocomplete: (input: string, opts?: {lat?: number; lng?: number; sessionToken?: string; types?: string}) =>
    api.get('/places/autocomplete', { params: { input, ...opts } }).then(r => r.data),
  nearby: (lat: number, lng: number, opts?: {radius?: number; type?: string; keyword?: string}) =>
    api.get('/places/nearby', { params: { lat, lng, ...opts } }).then(r => r.data),
  search: (query: string, opts?: {lat?: number; lng?: number}) =>
    api.get('/places/search', { params: { query, ...opts } }).then(r => r.data),
  details: (placeId: string) =>
    api.get(`/places/${placeId}`).then(r => r.data),
  geocode: (address: string) =>
    api.get('/places/geocode/address', { params: { address } }).then(r => r.data),
  reverseGeocode: (lat: number, lng: number) =>
    api.get('/places/reverse/geocode', { params: { lat, lng } }).then(r => r.data),
  elevation: (path: string) =>
    api.get('/places/elevation/profile', { params: { path } }).then(r => r.data),
}

// ── Campings ──────────────────────────────────────────────────────────────────

export const campingsApi = {
  nearby: (lat: number, lng: number, opts?: {radius?: number; keyword?: string; campingcar?: boolean}) =>
    api.get('/campings/nearby', { params: { lat, lng, ...opts } }).then(r => r.data),
  kampaohNearby: (lat: number, lng: number, radius?: number) =>
    api.get('/campings/kampaoh/nearby', { params: { lat, lng, radius } }).then(r => r.data),
  checkAvailability: (camping: object, checkin: string, checkout: string, groupSize?: number) =>
    api.post('/campings/availability', { camping, checkin, checkout, groupSize }).then(r => r.data),
  checkBatchAvailability: (campings: object[], checkin: string, checkout: string, groupSize?: number) =>
    api.post('/campings/availability/batch', { campings, checkin, checkout, groupSize }).then(r => r.data),
  kampaohAvailability: (propertyId: string, checkin: string, checkout: string) =>
    api.get(`/campings/kampaoh/${propertyId}/availability`, { params: { checkin, checkout } }).then(r => r.data),
  checkReservation: (url: string) =>
    api.get('/campings/check-reservation', { params: { url } }).then(r => r.data),
}

// ── Park4Night ────────────────────────────────────────────────────────────────

export const park4nightApi = {
  nearby: (lat: number, lng: number, radius?: number, count?: number) =>
    api.get('/park4night/nearby', { params: { lat, lng, radius, count } }).then(r => r.data),
}

// ── Trails ────────────────────────────────────────────────────────────────────

export const trailsApi = {
  nearby: (lat: number, lng: number, radius?: number) =>
    api.get('/trails/nearby', { params: { lat, lng, radius } }).then(r => r.data),
  route: (coordinates: [number, number][], profile?: string) =>
    api.post('/trails/route', { coordinates, profile }).then(r => r.data),
  isochrone: (lat: number, lng: number, minutes?: number, profile?: string) =>
    api.get('/trails/isochrone', { params: { lat, lng, minutes, profile } }).then(r => r.data),
}

// ── Directions ────────────────────────────────────────────────────────────────

export const directionsApi = {
  get: (origin: string, destination: string, waypoints?: string[], mode?: string) =>
    api.get('/directions', { params: { origin, destination, waypoints: waypoints?.join('|'), mode } }).then(r => r.data),
  calculateForItinerary: (itineraryId: string) =>
    api.post(`/directions/itinerary/${itineraryId}`).then(r => r.data),
}

// ── AI ────────────────────────────────────────────────────────────────────────

export const aiApi = {
  chat: (message: string, itineraryId?: string, preferences?: object) =>
    api.post('/ai/chat', { message, itineraryId, preferences }).then(r => r.data),

  // Streaming chat via SSE — retourne un EventSource-like ReadableStream
  chatStream: (message: string, itineraryId?: string, model?: string, preferences?: object): Promise<Response> =>
    fetch(`${API_BASE || ''}/api/ai/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, itineraryId, model, stream: true, preferences }),
    }),

  suggestItinerary: (departure: string, destination: string, duration: number, preferences?: object) =>
    api.post('/ai/suggest-itinerary', { departure, destination, duration, preferences }).then(r => r.data),
  analyzeCampings: (campings: object[], checkin?: string, checkout?: string, groupSize?: number) =>
    api.post('/ai/analyze-campings', { campings, checkin, checkout, groupSize }).then(r => r.data),
  chatHistory: (itineraryId: string) =>
    api.get(`/ai/chat/${itineraryId}/history`).then(r => r.data),
  clearHistory: (itineraryId: string) =>
    api.delete(`/ai/chat/${itineraryId}/history`),
  generateDescription: (itinerary: object) =>
    api.post('/ai/generate-description', { itinerary }).then(r => r.data),
}


// --- Todo List ---
export const todoApi = {
  list:   () => api.get("/todos").then(r => r.data),
  create: (d: {text: string; category?: string; priority?: number}) => api.post("/todos", d).then(r => r.data),
  update: (id: string, d: any) => api.patch("/todos/" + id, d).then(r => r.data),
  delete: (id: string) => api.delete("/todos/" + id),
  clearDone: () => api.delete("/todos").then(r => r.data),
}