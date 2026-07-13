import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Tent, Footprints, Trash2, ChevronDown, ChevronUp,
  Star, Calendar, Moon, GripVertical, RefreshCw, Save,
  CheckCircle2, XCircle, HelpCircle, ExternalLink, Check,
  BookOpen, CalendarCheck, Mountain, Clock, TrendingUp,
  MapPin, Search, X, Navigation,
} from 'lucide-react'
import { useItineraryStore } from '../../store/itineraryStore'
import { useMapStore } from '../../store/mapStore'
import { campingsApi, placesApi, trailsApi } from '../../services/api'
import toast from 'react-hot-toast'
import type { Waypoint, Camping, AvailabilityResult, Trail, Place } from '../../types'

const ORDER_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#ec4899', '#14b8a6']

interface Props {
  waypoint: Waypoint
  index: number
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  isDragOver?: boolean
}

export default function WaypointCard({ waypoint, index, dragHandleProps, isDragOver }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [loadingCampings, setLoadingCampings] = useState(false)
  const [loadingTrails, setLoadingTrails] = useState(false)
  const [searchResults, setSearchResults] = useState<Camping[]>([])
  const [trailSearchResults, setLocalTrailResults] = useState<Trail[]>([])
  const [checkin, setCheckin] = useState(waypoint.checkin ?? '')
  const [checkout, setCheckout] = useState(waypoint.checkout ?? '')
  const [notes, setNotes] = useState(waypoint.notes ?? '')

  const { selectedWaypointId, selectWaypoint, updateWaypoint, deleteWaypoint } = useItineraryStore()
  const { fitBounds, setCampingSearchResults, setTrailSearchResults } = useMapStore()

  const isSelected = waypoint.id === selectedWaypointId
  const color = ORDER_COLORS[index % ORDER_COLORS.length]
  const favoriteCampings = waypoint.campings ?? []

  const calcNights = (ci: string, co: string): number => {
    if (!ci || !co) return 0
    const diff = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)
    return diff > 0 ? diff : 0
  }

  const loadCampings = async (forceReload = false): Promise<number | undefined> => {
    if (loadingCampings) return undefined
    if (!forceReload && searchResults.length > 0) {
      const { activeOverlays, toggleOverlay } = useMapStore.getState()
      if (!activeOverlays.has('campings')) toggleOverlay('campings')
      setExpanded(true)
      return favoriteCampings.length
    }
    setLoadingCampings(true)
    try {
      const data = await campingsApi.nearby(waypoint.lat, waypoint.lng, { radius: 30000 })
      const campings = Array.isArray(data) ? data : (data.campings ?? [])
      setSearchResults(campings)
      setCampingSearchResults(campings)
      const { activeOverlays, toggleOverlay } = useMapStore.getState()
      if (!activeOverlays.has('campings')) toggleOverlay('campings')
      return campings.length
    } catch {
      toast.error('Erreur lors de la recherche de campings')
      return undefined
    } finally {
      setLoadingCampings(false)
    }
  }

  const loadTrails = async (forceReload = false): Promise<number | undefined> => {
    if (loadingTrails) return undefined
    if (!forceReload && trailSearchResults.length > 0) {
      setExpanded(true)
      return trailSearchResults.length
    }
    setLoadingTrails(true)
    try {
      const data = await trailsApi.nearby(waypoint.lat, waypoint.lng)
      const trails = data.trails ?? []
      setLocalTrailResults(trails)
      setTrailSearchResults(trails)
      const { activeOverlays, toggleOverlay } = useMapStore.getState()
      if (!activeOverlays.has('trails')) toggleOverlay('trails')
      return trails.length
    } catch {
      toast.error('Erreur lors de la recherche de sentiers')
      return undefined
    } finally {
      setLoadingTrails(false)
    }
  }

  const handleSelect = () => {
    const willSelect = !isSelected
    selectWaypoint(waypoint.id)
    const points: { lat: number; lng: number }[] = [{ lat: waypoint.lat, lng: waypoint.lng }]
    for (const c of favoriteCampings) {
      if (typeof c.lat === 'number' && typeof c.lng === 'number') {
        points.push({ lat: c.lat, lng: c.lng as number })
      }
    }
    if (waypoint.selectedCamping && typeof waypoint.selectedCamping.lat === 'number') {
      points.push({ lat: waypoint.selectedCamping.lat!, lng: waypoint.selectedCamping.lng! as number })
    }
    for (const poi of (waypoint.pois ?? [])) {
      if (typeof poi.lat === 'number' && typeof poi.lng === 'number') {
        points.push({ lat: poi.lat, lng: poi.lng })
      }
    }
    fitBounds(points)
    if (willSelect) {
      loadCampings().then(count => {
        if (count !== undefined && searchResults.length === 0) {
          toast.success(`${count} camping(s) trouvé(s)`, { duration: 2000 })
        }
      })
    }
  }

  const handleSave = async () => {
    const n = calcNights(checkin, checkout)
    await updateWaypoint(waypoint.id, {
      nights: n,
      checkin: checkin || null,
      checkout: checkout || null,
      notes: notes || null,
    })
    toast.success('Étape mise à jour')
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer l'étape "${waypoint.name}" ?`)) return
    await deleteWaypoint(waypoint.id)
    toast.success('Étape supprimée')
  }

  const handleLoadCampings = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const count = await loadCampings()
    if (count !== undefined) {
      toast.success(`${count} camping(s) trouvé(s)`, { duration: 2000 })
      setExpanded(true)
    }
  }

  const handleLoadTrails = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const count = await loadTrails()
    if (count !== undefined) {
      toast.success(`${count} sentier(s) trouvé(s)`, { duration: 2000 })
      setExpanded(true)
    }
  }

  return (
    <div
      className={`transition-colors duration-150
        ${isSelected ? 'bg-slate-800/50' : 'hover:bg-slate-800/30'}
        ${isDragOver ? 'border-t-2 border-accent' : 'border-t-2 border-transparent'}`}
    >
      <div className="px-3 py-2.5 cursor-pointer select-none" onClick={handleSelect}>
        <div className="flex items-start gap-2.5">
          <div
            {...dragHandleProps}
            className="flex-shrink-0 flex items-center self-stretch cursor-grab active:cursor-grabbing text-muted/40 hover:text-muted/80 -ml-1 pr-0.5"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5"
            style={{ backgroundColor: color }}
          >
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium text-slate-100 truncate">{waypoint.name}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                {expanded && (
                  <button
                    onClick={e => { e.stopPropagation(); handleSave() }}
                    className="p-1 text-muted hover:text-accent transition-colors"
                    title="Enregistrer l'étape"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  className="p-0.5 text-muted hover:text-slate-300"
                >
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            {waypoint.address && (
              <p className="text-xs text-muted truncate mt-0.5">{waypoint.address}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {waypoint.nights > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Moon className="w-3 h-3" />
                  {waypoint.nights} nuit{waypoint.nights > 1 ? 's' : ''}
                </span>
              )}
              {waypoint.checkin && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Calendar className="w-3 h-3" />
                  {new Date(waypoint.checkin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  {waypoint.checkout && (
                    <> → {new Date(waypoint.checkout).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</>
                  )}
                </span>
              )}
              {(waypoint.distanceFromPrev || waypoint.durationFromPrev) && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Navigation className="w-3 h-3" />
                  {waypoint.distanceFromPrev ? `${(waypoint.distanceFromPrev).toFixed(0)} km` : ''}
                  {waypoint.distanceFromPrev && waypoint.durationFromPrev ? ' · ' : ''}
                  {waypoint.durationFromPrev
                    ? waypoint.durationFromPrev >= 60
                      ? `${Math.floor(waypoint.durationFromPrev / 60)}h${String(Math.round(waypoint.durationFromPrev % 60)).padStart(2, '0')}`
                      : `${Math.round(waypoint.durationFromPrev)} min`
                    : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {waypoint.selectedCamping && (
                <span className="badge badge-green">
                  <Tent className="w-2.5 h-2.5" />
                  {waypoint.selectedCamping.name}
                </span>
              )}
              {favoriteCampings.length > 0 && (
                <span className="badge" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <Star className="w-2.5 h-2.5" style={{ fill: '#f59e0b' }} />
                  {favoriteCampings.length}
                </span>
              )}
              {(waypoint.trails?.length ?? 0) > 0 && (
                <span className="badge badge-green">
                  <Footprints className="w-2.5 h-2.5" />
                  {waypoint.trails!.length}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2 pl-8">
          <button onClick={handleLoadCampings} disabled={loadingCampings} className="btn-ghost px-2 py-1 text-xs gap-1 flex-1">
            {loadingCampings ? <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" /> : <Tent className="w-3 h-3" />}
            Campings
          </button>
          <button onClick={handleLoadTrails} disabled={loadingTrails} className="btn-ghost px-2 py-1 text-xs gap-1 flex-1">
            {loadingTrails ? <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" /> : <Footprints className="w-3 h-3" />}
            Rando
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <WaypointDetails
              waypoint={waypoint}
              onUpdateWaypoint={updateWaypoint}
              onDelete={handleDelete}
              onReloadCampings={() => loadCampings(true)}
              loadingCampings={loadingCampings}
              searchResults={searchResults}
              trailSearchResults={trailSearchResults}
              loadingTrails={loadingTrails}
              onReloadTrails={() => loadTrails(true)}
              checkin={checkin}
              checkout={checkout}
              notes={notes}
              setCheckin={setCheckin}
              setCheckout={setCheckout}
              setNotes={setNotes}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WaypointDetails({
  waypoint, onUpdateWaypoint, onDelete, onReloadCampings, loadingCampings, searchResults,
  trailSearchResults, loadingTrails, onReloadTrails,
  checkin, checkout, notes, setCheckin, setCheckout, setNotes,
}: {
  waypoint: Waypoint
  onUpdateWaypoint: (id: string, data: Partial<Waypoint>) => Promise<void>
  onDelete: () => void
  onReloadCampings: () => Promise<number | undefined>
  loadingCampings: boolean
  searchResults: Camping[]
  trailSearchResults: Trail[]
  loadingTrails: boolean
  onReloadTrails: () => Promise<number | undefined>
  checkin: string
  checkout: string
  notes: string
  setCheckin: (v: string) => void
  setCheckout: (v: string) => void
  setNotes: (v: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'campings' | 'randonnees' | 'lieux'>('campings')
  const [availabilities, setAvailabilities] = useState<Record<string, AvailabilityResult>>({})
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [checkingResa, setCheckingResa] = useState(false)
  const [resaProgress, setResaProgress] = useState<{ done: number; total: number } | null>(null)
  const [poiQuery, setPoiQuery] = useState('')
  const [poiResults, setPoiResults] = useState<Place[]>([])
  const [loadingPOI, setLoadingPOI] = useState(false)
  const { flyTo, setSelectedCamping, setSelectedTrail, toggleOverlay, activeOverlays } = useMapStore()
  const { patchCampingReservation, addFavoriteCamping, removeFavoriteCamping, addFavoriteTrail, removeFavoriteTrail, addPOI, removePOI } = useItineraryStore()

  const favoriteCampings = waypoint.campings ?? []
  const favoriteTrails = waypoint.trails ?? []
  const savedPOIs = waypoint.pois ?? []
  const favoritePlaceIds = new Set(favoriteCampings.map(c => c.placeId))
  const favoriteTrailIds = new Set(favoriteTrails.map(t => t.id))
  const savedPOIIds = new Set(savedPOIs.map(p => p.placeId))

  const handleSearchPOI = async () => {
    if (!poiQuery.trim()) return
    setLoadingPOI(true)
    try {
      const data = await placesApi.search(poiQuery, { lat: waypoint.lat, lng: waypoint.lng })
      const places: Place[] = Array.isArray(data) ? data : (data.places ?? data.results ?? [])
      setPoiResults(places)
      if (!activeOverlays.has('pois')) toggleOverlay('pois')
    } catch {
      toast.error('Erreur lors de la recherche de lieux')
    } finally {
      setLoadingPOI(false)
    }
  }

  const calcNights = (ci: string, co: string): number => {
    if (!ci || !co) return 0
    const diff = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)
    return diff > 0 ? diff : 0
  }
  const nights = calcNights(checkin, checkout)
  const hasValidDates = !!checkin && !!checkout && nights > 0

  const handleCheckAllReservations = async () => {
    const campingsWithSite = favoriteCampings.filter(c => (c.website || c.placeId) && !c.reservationInfo)
    if (!campingsWithSite.length) { toast('Tous les campings ont déjà été vérifiés', { icon: 'ℹ️' }); return }
    setCheckingResa(true)
    setResaProgress({ done: 0, total: campingsWithSite.length })
    let done = 0
    for (const camping of campingsWithSite) {
      try {
        let url = camping.website
        if (!url && camping.placeId) { const details = await placesApi.details(camping.placeId); url = details?.website }
        if (!url) { done++; setResaProgress({ done, total: campingsWithSite.length }); continue }
        const result = await campingsApi.checkReservation(url)
        patchCampingReservation(waypoint.id, camping.placeId!, result)
      } catch { /* skip */ }
      done++
      setResaProgress({ done, total: campingsWithSite.length })
    }
    setCheckingResa(false); setResaProgress(null)
    toast.success('Vérification des réservations terminée')
  }

  const handleCheckAvailability = async () => {
    if (!hasValidDates) { toast.error("Renseignez une date d'arrivée et une date de départ"); return }
    const campingsToCheck = favoriteCampings.filter(c => c.kampaohId)
    if (!campingsToCheck.length) { toast.error('Aucun camping Kampaoh vérifiable'); return }
    setLoadingAvail(true)
    try {
      const results = await campingsApi.checkBatchAvailability(campingsToCheck, checkin, checkout)
      const newAvail: Record<string, AvailabilityResult> = {}
      campingsToCheck.forEach((c, i) => { if (c.kampaohId) newAvail[c.kampaohId] = results[i] })
      setAvailabilities(newAvail)
      const available = Object.values(newAvail).filter(r => r.available).length
      toast.success(`${available} / ${campingsToCheck.length} disponibles`)
    } catch { toast.error('Erreur lors de la vérification des disponibilités') }
    finally { setLoadingAvail(false) }
  }

  return (
    <div className="px-3 pb-3 pl-8 space-y-3 border-t border-border/20 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted block mb-1">Arrivée</label>
          <input type="date" value={checkin} onChange={e => setCheckin(e.target.value)} className="input text-xs py-1 px-2" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Départ</label>
          <input type="date" value={checkout} min={checkin || undefined} onChange={e => setCheckout(e.target.value)} className="input text-xs py-1 px-2" />
        </div>
      </div>
      {nights > 0 && (
        <p className="text-xs text-muted flex items-center gap-1">
          <Moon className="w-3 h-3" /> {nights} nuit{nights > 1 ? 's' : ''}
        </p>
      )}
      <div>
        <label className="text-xs text-muted block mb-1">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input text-xs py-1 px-2 resize-none" placeholder="Idées, contacts, parking…" />
      </div>
      {waypoint.selectedCamping && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
          <p className="text-xs font-medium text-green-400 flex items-center gap-1">
            <Tent className="w-3 h-3" />{waypoint.selectedCamping.name}
          </p>
          {waypoint.selectedCamping.rating && (
            <p className="text-xs text-muted flex items-center gap-0.5 mt-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400" />{waypoint.selectedCamping.rating}
            </p>
          )}
        </div>
      )}
      <div>
        <div className="flex border-b border-border/30 mb-2">
          <button onClick={() => setActiveTab('campings')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1
              ${activeTab === 'campings' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-muted hover:text-slate-300'}`}>
            <Tent className="w-3 h-3" />Campings
            {favoriteCampings.length > 0 && <span className="ml-0.5 text-[10px] text-yellow-400">★{favoriteCampings.length}</span>}
          </button>
          <button onClick={() => setActiveTab('randonnees')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1
              ${activeTab === 'randonnees' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-muted hover:text-slate-300'}`}>
            <Footprints className="w-3 h-3" />Randonnées
            {favoriteTrails.length > 0 && <span className="ml-0.5 text-[10px] text-yellow-400">★{favoriteTrails.length}</span>}
          </button>
          <button onClick={() => setActiveTab('lieux')}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1
              ${activeTab === 'lieux' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-muted hover:text-slate-300'}`}>
            <MapPin className="w-3 h-3" />Lieux
            {savedPOIs.length > 0 && <span className="ml-0.5 text-[10px] text-purple-400">●{savedPOIs.length}</span>}
          </button>
        </div>
        {activeTab === 'campings' && (
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-yellow-400" style={{ fill: '#facc15' }} />Favoris ({favoriteCampings.length})
                </span>
                <div className="flex items-center gap-1">
                  {favoriteCampings.length > 0 && (
                    <button onClick={handleCheckAllReservations} disabled={checkingResa}
                      className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                      {checkingResa
                        ? <><span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />{resaProgress ? `${resaProgress.done}/${resaProgress.total}` : ''}</>
                        : <><CalendarCheck className="w-3 h-3" />Résa</>}
                    </button>
                  )}
                  {hasValidDates && favoriteCampings.some(c => c.kampaohId) && (
                    <button onClick={handleCheckAvailability} disabled={loadingAvail}
                      className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                      {loadingAvail ? <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" /> : <Calendar className="w-3 h-3" />}Dispo
                    </button>
                  )}
                </div>
              </div>
              {favoriteCampings.length === 0
                ? <p className="text-xs text-muted italic">Aucun favori — ajoutez-en depuis la carte ou les résultats</p>
                : <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                    {favoriteCampings.map(camping => (
                      <CampingItem key={camping.placeId} camping={camping}
                        availability={camping.kampaohId ? availabilities[camping.kampaohId] : undefined}
                        isSelected={waypoint.selectedCamping?.placeId === camping.placeId} isFavorite={true}
                        onSelect={() => { if (typeof camping.lat === 'number') { flyTo(camping.lat, camping.lng as number, 15); setSelectedCamping(camping.placeId) } }}
                        onToggleFavorite={() => removeFavoriteCamping(waypoint.id, camping.placeId!)} />
                    ))}
                  </div>}
            </div>
            {(searchResults.length > 0 || loadingCampings) && (() => {
              const nonFavResults = searchResults.filter(c => !favoritePlaceIds.has(c.placeId))
              return (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Tent className="w-3 h-3 text-accent" />Résultats ({nonFavResults.length})
                  </span>
                  <button onClick={() => onReloadCampings()} disabled={loadingCampings} className="p-1 text-muted hover:text-slate-300 transition-colors">
                    <RefreshCw className={`w-3 h-3 ${loadingCampings ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                  {nonFavResults.map(camping => (
                    <CampingItem key={camping.placeId} camping={camping} isSelected={false}
                      isFavorite={false}
                      onSelect={() => { if (typeof camping.lat === 'number') { flyTo(camping.lat, camping.lng as number, 15); setSelectedCamping(camping.placeId) } }}
                      onToggleFavorite={() => addFavoriteCamping(waypoint.id, camping)} />
                  ))}
                </div>
              </div>
              )
            })()}
          </div>
        )}
        {activeTab === 'randonnees' && (
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-yellow-400" style={{ fill: '#facc15' }} />Favoris ({favoriteTrails.length})
                </span>
              </div>
              {favoriteTrails.length === 0
                ? <p className="text-xs text-muted italic">Aucune rando favorite — ajoutez-en depuis les résultats</p>
                : <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                    {favoriteTrails.map(trail => (
                      <TrailItem key={trail.id} trail={trail} isFavorite={true}
                        onSelect={() => { flyTo(trail.lat, trail.lng, 14); setSelectedTrail(trail.id) }}
                        onToggleFavorite={() => removeFavoriteTrail(waypoint.id, trail.id)} />
                    ))}
                  </div>}
            </div>
            {(trailSearchResults.length > 0 || loadingTrails) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Footprints className="w-3 h-3 text-accent" />Résultats ({trailSearchResults.length})
                  </span>
                  <button onClick={() => onReloadTrails()} disabled={loadingTrails} className="p-1 text-muted hover:text-slate-300 transition-colors">
                    <RefreshCw className={`w-3 h-3 ${loadingTrails ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                  {trailSearchResults.map(trail => (
                    <TrailItem key={trail.id} trail={trail} isFavorite={favoriteTrailIds.has(trail.id)}
                      onSelect={() => { flyTo(trail.lat, trail.lng, 14); setSelectedTrail(trail.id) }}
                      onToggleFavorite={() => { if (favoriteTrailIds.has(trail.id)) removeFavoriteTrail(waypoint.id, trail.id); else addFavoriteTrail(waypoint.id, trail) }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'lieux' && (
          <div className="space-y-2">
            {/* Saved POIs */}
            <div>
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3 h-3 text-purple-400" />Points d'intérêt ({savedPOIs.length})
              </span>
              {savedPOIs.length === 0
                ? <p className="text-xs text-muted italic">Aucun lieu enregistré — recherchez et ajoutez-en ci-dessous</p>
                : <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                    {savedPOIs.map(poi => (
                      <div key={poi.placeId}
                        className="flex items-center gap-2 p-1.5 rounded-md text-xs hover:bg-slate-700/40 cursor-pointer"
                        onClick={() => { flyTo(poi.lat, poi.lng, 16) }}>
                        <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium text-slate-200">{poi.name}</p>
                          {poi.address && <p className="truncate text-muted text-[10px]">{poi.address}</p>}
                        </div>
                        {poi.website && (
                          <a href={poi.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="flex-shrink-0 p-1 text-muted hover:text-slate-300">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button onClick={e => { e.stopPropagation(); removePOI(waypoint.id, poi.placeId) }}
                          className="flex-shrink-0 p-1 text-muted hover:text-red-400 transition-colors" title="Supprimer">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>}
            </div>
            {/* Search */}
            <div>
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Search className="w-3 h-3 text-accent" />Rechercher un lieu
              </span>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={poiQuery}
                  onChange={e => setPoiQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchPOI()}
                  placeholder="Restaurant, musée, plage…"
                  className="input text-xs py-1 px-2 flex-1"
                />
                <button onClick={handleSearchPOI} disabled={loadingPOI}
                  className="btn-ghost px-2 py-1 text-xs shrink-0">
                  {loadingPOI ? <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {poiResults.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Search className="w-3 h-3 text-accent" />Résultats ({poiResults.length})
                </span>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                  {poiResults.map(poi => (
                    <div key={poi.placeId}
                      className="flex items-center gap-2 p-1.5 rounded-md text-xs hover:bg-slate-700/40 cursor-pointer"
                      onClick={() => { flyTo(poi.lat, poi.lng, 16) }}>
                      <MapPin className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-slate-200">{poi.name}</p>
                        {poi.address && <p className="truncate text-muted text-[10px]">{poi.address}</p>}
                        {poi.rating && <span className="text-yellow-400 text-[10px]">★ {poi.rating}</span>}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); addPOI(waypoint.id, poi).then(() => toast.success('Lieu ajouté', { duration: 1500 })) }}
                        disabled={savedPOIIds.has(poi.placeId)}
                        className={`flex-shrink-0 p-1 transition-colors ${savedPOIIds.has(poi.placeId) ? 'text-purple-400' : 'text-muted hover:text-purple-400'}`}
                        title={savedPOIIds.has(poi.placeId) ? 'Déjà enregistré' : 'Ajouter comme point d\'intérêt'}>
                        <MapPin className="w-3.5 h-3.5" style={{ fill: savedPOIIds.has(poi.placeId) ? 'currentColor' : 'none' }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <button onClick={onDelete}
        className="w-full py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors flex items-center justify-center gap-1.5">
        <Trash2 className="w-3.5 h-3.5" />Supprimer l'étape
      </button>
    </div>
  )
}

function CampingItem({ camping, availability, isSelected, isFavorite, onSelect, onToggleFavorite }: {
  camping: Camping; availability?: AvailabilityResult; isSelected: boolean; isFavorite?: boolean
  onSelect: () => void; onToggleFavorite?: () => void
}) {
  const { setHoveredCamping } = useMapStore()
  return (
    <div className={`flex items-center gap-2 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${isSelected ? 'bg-green-500/10 border border-green-500/30' : 'hover:bg-slate-700/40'}`}
      onClick={onSelect} onMouseEnter={() => setHoveredCamping(camping.placeId ?? null)} onMouseLeave={() => setHoveredCamping(null)}>
      <div className="flex-shrink-0 w-4">
        {isSelected ? <Check className="w-3.5 h-3.5 text-green-400" />
          : availability?.available === true ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          : availability?.available === false ? <XCircle className="w-3.5 h-3.5 text-red-400" />
          : availability ? <HelpCircle className="w-3.5 h-3.5 text-muted" /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium ${isSelected ? 'text-green-400' : 'text-slate-200'}`}>{camping.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {camping.rating && <span className="flex items-center gap-0.5 text-yellow-400"><Star className="w-2.5 h-2.5" />{camping.rating}</span>}
          {camping.kampaohId && <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><BookOpen className="w-2.5 h-2.5" />Kampaoh</span>}
          {camping.webcampId && <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30"><BookOpen className="w-2.5 h-2.5" />Webcamp</span>}
          {!camping.kampaohId && !camping.webcampId && camping.bookingProvider && camping.bookingProvider !== 'kampaoh' && camping.bookingProvider !== 'webcamp' && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/30">
              <BookOpen className="w-2.5 h-2.5" />{camping.bookingProvider.charAt(0).toUpperCase() + camping.bookingProvider.slice(1).replace(/_/g, ' ')}
            </span>
          )}
          {!camping.kampaohId && !camping.webcampId && !camping.bookingProvider && camping.website && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] text-muted/70 border border-border/30">Site web</span>
          )}
          {camping.reservationInfo && (
            <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-semibold border ${camping.reservationInfo.acceptsReservation === true ? 'bg-green-500/15 text-green-400 border-green-500/30' : camping.reservationInfo.acceptsReservation === false ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
              {camping.reservationInfo.acceptsReservation === true ? '✓ Résa OK' : camping.reservationInfo.acceptsReservation === false ? '✗ Sans résa' : '? Résa ?'}
            </span>
          )}
          {availability?.available === true && <span className="text-green-400 font-medium">✓ Dispo</span>}
          {availability?.available === false && <span className="text-red-400">✗ Complet</span>}
          {availability?.results?.[0]?.plans?.[0]?.price && <span className="text-muted">dès {availability.results[0].plans![0].price}€</span>}
        </div>
      </div>
      {onToggleFavorite && (
        <button onClick={e => { e.stopPropagation(); onToggleFavorite() }} className="flex-shrink-0 p-1 transition-colors"
          style={{ color: isFavorite ? '#f59e0b' : '#64748b' }} title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <Star className="w-3.5 h-3.5" style={{ fill: isFavorite ? '#f59e0b' : 'none' }} />
        </button>
      )}
      {camping.website && (
        <a href={camping.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="flex-shrink-0 p-1 text-muted hover:text-slate-300 transition-colors" title="Ouvrir le site">
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

function TrailItem({ trail, isFavorite, onSelect, onToggleFavorite }: {
  trail: Trail; isFavorite?: boolean; onSelect: () => void; onToggleFavorite?: () => void
}) {
  const diffColor: Record<string, string> = { easy: 'text-green-400', moderate: 'text-yellow-400', hard: 'text-orange-400', expert: 'text-red-400', unknown: 'text-muted' }
  return (
    <div className="flex items-center gap-2 p-1.5 rounded-md text-xs transition-colors cursor-pointer hover:bg-slate-700/40" onClick={onSelect}>
      <div className="flex-shrink-0 w-4"><Mountain className="w-3.5 h-3.5 text-muted" /></div>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-slate-200">{trail.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`font-medium ${diffColor[trail.difficulty] ?? 'text-muted'}`}>{trail.difficultyLabel}</span>
          {trail.distance != null && <span className="text-muted">{trail.distance.toFixed(1)} km</span>}
          {trail.duration != null && <span className="flex items-center gap-0.5 text-muted"><Clock className="w-2.5 h-2.5" />{Math.round(trail.duration)}min</span>}
          {trail.ascent != null && <span className="flex items-center gap-0.5 text-muted"><TrendingUp className="w-2.5 h-2.5" />{trail.ascent}m</span>}
        </div>
      </div>
      {onToggleFavorite && (
        <button onClick={e => { e.stopPropagation(); onToggleFavorite() }} className="flex-shrink-0 p-1 transition-colors"
          style={{ color: isFavorite ? '#f59e0b' : '#64748b' }} title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
          <Star className="w-3.5 h-3.5" style={{ fill: isFavorite ? '#f59e0b' : 'none' }} />
        </button>
      )}
      {trail.waymarkedUrl && (
        <a href={trail.waymarkedUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="flex-shrink-0 p-1 text-muted hover:text-slate-300 transition-colors">
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
