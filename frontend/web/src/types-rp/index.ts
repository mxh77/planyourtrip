// ── Core domain types ──────────────────────────────────────────────────────────

export interface LatLng {
  lat: number
  lng: number
}

export interface Waypoint {
  id: string
  itineraryId: string
  name: string
  address?: string
  lat: number
  lng: number
  order: number
  nights: number
  checkin?: string | null
  checkout?: string | null
  notes?: string | null
  selectedCamping?: Camping | null
  campings?: Camping[]
  trails?: Trail[]
  pois?: Place[]
  distanceFromPrev?: number | null // km
  durationFromPrev?: number | null // minutes
  routePolyline?: string | null    // encoded polyline from previous waypoint
  createdAt?: string
  updatedAt?: string
}

export interface Itinerary {
  id: string
  name: string
  description?: string | null
  waypoints: Waypoint[]
  messages?: ChatMessage[]
  preferences?: ItineraryPreferences | null
  totalDistance?: number | null // km
  totalDuration?: number | null // minutes
  createdAt: string
  updatedAt: string
  _count?: { waypoints: number }
}

export interface ItineraryPreferences {
  groupSize: number
  startDate?: string
  endDate?: string
  budget?: 'low' | 'medium' | 'high'
  vehicleType?: 'car' | 'campervan' | 'motorhome' | 'tent'
  interests?: string[]
  language?: string
}

// ── Places & Campings ──────────────────────────────────────────────────────────

export interface Place {
  placeId: string
  name: string
  address?: string
  lat: number
  lng: number
  rating?: number
  userRatingsTotal?: number
  types?: string[]
  photo?: string | null
  openNow?: boolean
  priceLevel?: number
  website?: string
  phone?: string
  openingHours?: string[]
  isOpen?: boolean
  photos?: string[]
  reviews?: PlaceReview[]
  url?: string
  vicinity?: string
}

export interface PlaceReview {
  author: string
  rating: number
  text: string
  time: string
}

export interface Camping extends Place {
  source?: 'google' | 'kampaoh' | 'webcamp'
  kampaohId?: string | null
  webcampId?: string | null
  availability?: AvailabilityResult | null
  amenities?: string[]
  acceptsCampingCar?: boolean
  bookingProvider?: string | null
  reservationInfo?: ReservationInfo | null
}

export interface ReservationInfo {
  status: 'reservation_found' | 'reservation_likely' | 'no_reservation' | 'unknown' | 'no_website' | 'error'
  acceptsReservation: boolean | null
  message: string
  providers: string[]
  signals: string[]
}

export interface AvailabilityResult {
  available: boolean | null
  checkin?: string
  checkout?: string
  groupSize?: number
  results: ProviderAvailability[]
  bookingUrl?: string | null
  error?: string
}

export interface ProviderAvailability {
  provider: 'kampaoh' | 'webcamp'
  available: boolean | null
  plans?: KampaohPlan[]
  products?: WebcampProduct[]
  error?: string
}

export interface KampaohPlan {
  roomName: string
  planName: string
  price: number
  currency: string
  available: boolean
  minStay?: number
}

export interface WebcampProduct {
  name: string
  begin: string
  end: string
  duration: number
  price: number
  stock: number
}

// ── Trails ─────────────────────────────────────────────────────────────────────

export type TrailDifficulty = 'easy' | 'moderate' | 'hard' | 'expert' | 'unknown'

export interface Trail {
  id: string
  name: string
  description?: string
  lat: number
  lng: number
  distance?: number | null   // km
  ascent?: number            // m
  descent?: number           // m
  difficulty: TrailDifficulty
  difficultyLabel: string
  duration?: number | null   // minutes
  durationLabel: string
  color: string
  website?: string
  osmUrl?: string
  waymarkedUrl?: string
  // Google Places
  source?: 'osm' | 'google'
  googlePlaceId?: string
  gmapsUrl?: string
  rating?: number
  userRatingsTotal?: number
  photo?: string
}

// ── Chat ───────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  itineraryId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCall[]
  createdAt: string
  isStreaming?: boolean // client-only, in-flight
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
  result?: unknown
}

// ── Map state ──────────────────────────────────────────────────────────────────

export type MapMode =
  | 'idle'              // Survol normal
  | 'adding-waypoint'   // Clic pour ajouter une étape
  | 'selecting-camping' // Clic pour sélectionner un camping
  | 'viewing-trail'     // Affichage d'un sentier

export type OverlayType = 'campings' | 'trails' | 'pois' | 'heatmap' | 'park4night'

export interface P4NPlace {
  id: number
  name: string
  lat: number
  lng: number
  description: string | null
  typeId: number
  typeLabel: string
  typeColor: string
  rating: number | null
  nbRatings: number
  nbPhotos: number
  url: string
  address?: { street?: string; zipcode?: string; city?: string; country?: string } | null
  services?: string[]
  activities?: string[]
  image?: string | null
  distance?: number | null
}

export interface MapFilter {
  minRating: number
  maxDistance: number  // km from waypoint
  requireParking: boolean
  requirePool: boolean
  requireWifi: boolean
  vehicleTypes: string[]
  trailDifficulty: TrailDifficulty[]
  trailMaxDistance: number  // km max for trails
  poiMaxDistance: number     // km max for POI
  p4nTypes: number[]  // typeIds à afficher, vide = tous
}

// ── Directions ─────────────────────────────────────────────────────────────────

export interface DirectionsResult {
  totalDistance: number // km
  totalDuration: number // minutes
  polyline: string
  legs: DirectionLeg[]
  bounds?: google.maps.LatLngBoundsLiteral
}

export interface DirectionLeg {
  startAddress: string
  endAddress: string
  distance: { value: number; text: string }
  duration: { value: number; text: string }
  steps: DirectionStep[]
}

export interface DirectionStep {
  instruction: string
  distance: string
  duration: string
  maneuver: string
}

// ── AI Suggestions ─────────────────────────────────────────────────────────────

export interface ItinerarySuggestion {
  title: string
  description: string
  waypoints: SuggestedWaypoint[]
  tips?: string[]
}

export interface SuggestedWaypoint {
  order: number
  name: string
  location: string
  nights: number
  description: string
  highlights: string[]
  campingKeyword?: string
}

export interface CampingAnalysis {
  recommended: { name: string; reason: string; score: number }[]
  concerns: string[]
  tips: string[]
}

// ── UI panels ──────────────────────────────────────────────────────────────────

export type PanelId = 'itinerary' | 'campings' | 'trails' | 'pois' | 'settings' | 'none'
export type SidePanel = 'chat' | 'summary' | 'todo' | 'checklist' | 'none'

export interface AppNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  timestamp: number
}


// --- Todo list ---
export interface TodoItem {
  id: string
  text: string
  done: boolean
  category?: "equipement" | "courses" | "admin" | "divers" | null
  priority: number
  order: number
  createdAt: string
  updatedAt: string
}
