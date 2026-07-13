import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Map, Plus, Route, BarChart3,
  ChevronLeft, ChevronRight, Save, Sparkles,
  Tent, Navigation, Upload, MapPin, Download, ListTodo,
  ChevronDown, Filter, BookText, AlertTriangle,
} from 'lucide-react'
import SearchBar from '../SearchBar/SearchBar'
import { useItineraryStore } from '../../store/itineraryStore'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import ImportGoogleMapsModal from './ImportGoogleMapsModal'
import toast from 'react-hot-toast'
import type { Place } from '../../types'

export default function Header({ mapsLoaded }: { mapsLoaded: boolean }) {
  const [newItinName, setNewItinName] = useState('')
  const [showNewItin, setShowNewItin] = useState(false)
  const [lastPlace, setLastPlace] = useState<Place | null>(null)
  const [addingPlace, setAddingPlace] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showItinSelector, setShowItinSelector] = useState(false)
  const itinRef = useRef<HTMLDivElement>(null)

  const { currentItinerary, itineraries, createItinerary, calculateRoute, isCalculatingRoute, isSaving, loadItinerary, loadItineraries } = useItineraryStore()
  const { setMode, mode, activeOverlays, toggleOverlay, flyTo, filter } = useMapStore()
  const { isSidebarOpen, toggleSidebar, sidePanel, setSidePanel, openModal } = useUIStore()

  // Filter badge count
  const filterCount = useMemo(() => {
    let count = 0
    if (filter.minRating > 0) count++
    if (filter.requireParking) count++
    if (filter.requirePool) count++
    if (filter.requireWifi) count++
    if (filter.trailDifficulty.length > 0) count++
    if (filter.trailMaxDistance > 0) count++
    if (filter.poiMaxDistance > 0) count++
    if (filter.p4nTypes.length > 0) count++
    return count
  }, [filter])

  const handleCreateItinerary = async () => {
    const name = newItinName.trim() || 'Mon road trip'
    await createItinerary(name)
    setNewItinName('')
    setShowNewItin(false)
    toast.success(`Itinéraire "${name}" créé !`)
  }

  const handleSearchSelect = (place: Place) => {
    flyTo(place.lat, place.lng, 13)
    setLastPlace(place)
  }

  const handleAddPlaceAsStep = async () => {
    if (!lastPlace || !currentItinerary) {
      if (!currentItinerary) toast.error("Créez ou sélectionnez un itinéraire d'abord.")
      return
    }
    setAddingPlace(true)
    try {
      const { addWaypoint } = useItineraryStore.getState()
      await addWaypoint({
        name: lastPlace.name,
        address: lastPlace.address,
        lat: lastPlace.lat,
        lng: lastPlace.lng,
        nights: 1,
      })
      toast.success(`« ${lastPlace.name} » ajouté comme étape`)
      setLastPlace(null)
    } catch {
      toast.error("Erreur lors de l'ajout de l'étape")
    } finally {
      setAddingPlace(false)
    }
  }

  const handleExport = () => {
    if (!currentItinerary) { toast.error('Aucun itinéraire à exporter'); return }
    const data = {
      name: currentItinerary.name,
      description: currentItinerary.description,
      waypoints: currentItinerary.waypoints.map(w => ({
        name: w.name,
        address: w.address,
        lat: w.lat,
        lng: w.lng,
        nights: w.nights,
        checkin: w.checkin,
        checkout: w.checkout,
        notes: w.notes,
        campings: w.campings,
        trails: w.trails,
        pois: w.pois,
        selectedCamping: w.selectedCamping,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentItinerary.name.replace(/[^a-z0-9]/gi, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Itinéraire exporté')
  }

  const handleCalculateRoute = async () => {
    if (!currentItinerary || currentItinerary.waypoints.length < 2) {
      toast.error('Ajoutez au moins 2 étapes pour calculer la route.')
      return
    }
    await calculateRoute()
    toast.success('Route calculée !')
  }

  // Close itinerary selector on outside click
  useEffect(() => {
    if (!showItinSelector) return
    const handler = (e: MouseEvent) => {
      if (itinRef.current && !itinRef.current.contains(e.target as Node)) {
        setShowItinSelector(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showItinSelector])

  return (
    <>
    <header className="bg-card border-b border-border/50 px-4 py-2.5 flex items-center gap-3 z-20 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center">
          <Tent className="w-4 h-4 text-accent" />
        </div>
        <span className="font-bold text-slate-100 hidden sm:block text-sm tracking-tight">
          RoadTrip<span className="text-accent">Planner</span>
        </span>
      </div>

      <div className="w-px h-6 bg-border/50 shrink-0" />

      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="btn-ghost p-1.5"
        title={isSidebarOpen ? 'Masquer la sidebar' : 'Afficher la sidebar'}
      >
        {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* ── Itinéraire selector dropdown ── */}
      <div className="relative" ref={itinRef}>
        <button
          onClick={() => { setShowItinSelector(v => !v); if (!itineraries.length) loadItineraries() }}
          className="btn-ghost px-2 py-1.5 gap-1.5 text-xs max-w-[200px]"
          title="Sélectionner un itinéraire"
        >
          <span className="truncate font-medium text-slate-200">
            {currentItinerary?.name ?? "Itinéraire…"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted" />
        </button>
        <AnimatePresence>
          {showItinSelector && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="fixed top-[52px] left-3 right-3 md:absolute md:top-full md:left-0 md:right-auto md:w-72 card shadow-xl z-[9999] overflow-hidden"
            >
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/20">
                {itineraries.length === 0 && (
                  <p className="text-xs text-muted p-4 text-center">Aucun itinéraire</p>
                )}
                {itineraries.map(itin => (
                  <button
                    key={itin.id}
                    onClick={() => { loadItinerary(itin.id); setShowItinSelector(false) }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-surface-800 transition-colors ${
                      currentItinerary?.id === itin.id ? 'bg-surface-800/80' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-200 truncate">{itin.name}</p>
                    <p className="text-[10px] text-muted">
                      {itin._count?.waypoints ?? itin.waypoints?.length ?? 0} étapes
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Barre de recherche + bouton ajout rapide */}
      {mapsLoaded && (
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
          <SearchBar
            onSelect={handleSearchSelect}
            placeholder="Rechercher un lieu…"
            className="flex-1"
          />
          <AnimatePresence>
            {lastPlace && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15 }}
                onClick={handleAddPlaceAsStep}
                disabled={addingPlace || !currentItinerary}
                className="btn-primary shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap disabled:opacity-40"
                title={currentItinerary ? `Ajouter "${lastPlace.name}" comme étape` : "Sélectionnez un itinéraire d'abord"}
              >
                {addingPlace
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <MapPin className="w-3.5 h-3.5" />
                }
                + Étape
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="flex-1 hidden md:block" />

      {/* Actions rapides — desktop */}
      <div className="hidden md:flex items-center gap-1.5">
        {/* Filtres */}
        <button
          onClick={() => openModal('filters')}
          className="btn-ghost p-1.5 gap-1.5 text-xs relative"
          title="Filtres"
        >
          <Filter className="w-4 h-4" />
          <span className="hidden md:block">Filtres</span>
          {filterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </button>

        {/* Exporter */}
        <button
          onClick={handleExport}
          className="btn-ghost p-1.5 gap-1.5 text-xs"
          title="Exporter l'itinéraire (JSON)"
          disabled={!currentItinerary}
        >
          <Download className="w-4 h-4" />
          <span className="hidden md:block">Exporter</span>
        </button>

        {/* Roadbook */}
        <button
          onClick={() => openModal('roadbook')}
          className="btn-ghost p-1.5 gap-1.5 text-xs"
          title="Roadbook"
          disabled={!currentItinerary}
        >
          <BookText className="w-4 h-4" />
          <span className="hidden md:block">Roadbook</span>
        </button>

        {/* Importer */}
        <button
          onClick={() => setShowImport(true)}
          className="btn-ghost p-1.5 gap-1.5 text-xs"
          title="Importer depuis Google Maps ou fichier JSON"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden md:block">Importer</span>
        </button>

        {/* Nouveau */}
        <div className="relative">
          <button
            onClick={() => setShowNewItin(v => !v)}
            className="btn-ghost p-1.5 gap-1.5 text-xs"
            title="Nouvel itinéraire"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:block">Nouveau</span>
          </button>
          <AnimatePresence>
            {showNewItin && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-64 card p-3 shadow-xl z-50"
              >
                <p className="text-xs text-muted mb-2">Nom de l'itinéraire</p>
                <input
                  autoFocus
                  value={newItinName}
                  onChange={e => setNewItinName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateItinerary()}
                  placeholder="Mon road trip en Espagne…"
                  className="input text-sm mb-2"
                />
                <button onClick={handleCreateItinerary} className="btn-primary w-full text-xs py-1.5">
                  Créer
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Ajouter étape */}
        <button
          onClick={() => setMode(mode === 'adding-waypoint' ? 'idle' : 'adding-waypoint')}
          className={`btn-ghost p-1.5 gap-1.5 text-xs ${mode === 'adding-waypoint' ? 'text-accent' : ''}`}
          title="Ajouter une étape sur la carte"
          disabled={!currentItinerary}
        >
          <Map className="w-4 h-4" />
          <span className="hidden lg:block">Étape</span>
        </button>

        {/* Route */}
        <button
          onClick={handleCalculateRoute}
          disabled={!currentItinerary || isCalculatingRoute}
          className="btn-ghost p-1.5 gap-1.5 text-xs"
          title="Calculer la route"
        >
          {isCalculatingRoute
            ? <span className="w-4 h-4 border border-muted border-t-transparent rounded-full animate-spin" />
            : <Route className="w-4 h-4" />
          }
          <span className="hidden lg:block">Route</span>
        </button>

        {/* Overlays */}
        <button
          onClick={() => toggleOverlay('campings')}
          className={`btn-ghost p-1.5 ${activeOverlays.has('campings') ? 'text-accent' : ''}`}
          title="Campings"
        >
          <Tent className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleOverlay('trails')}
          className={`btn-ghost p-1.5 ${activeOverlays.has('trails') ? 'text-green-400' : ''}`}
          title="Randonnées"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleOverlay('park4night')}
          className={`btn-ghost p-1.5 ${activeOverlays.has('park4night') ? 'text-indigo-400' : ''}`}
          title="Park4Night"
        >
          <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px] font-bold">P</span>
        </button>

        {/* To-Do List */}
        <button
          onClick={() => setSidePanel(sidePanel === 'todo' ? 'none' : 'todo')}
          className={`btn-ghost p-1.5 ${sidePanel === 'todo' ? 'text-accent' : ''}`}
          title="To-Do List"
        >
          <ListTodo className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-border/50" />

        {/* Vérification */}
        <button
          onClick={() => setSidePanel(sidePanel === 'checklist' ? 'none' : 'checklist')}
          className={`btn-ghost p-1.5 relative ${sidePanel === 'checklist' ? 'text-accent' : ''}`}
          title="Vérification de l'itinéraire"
          disabled={!currentItinerary}
        >
          <AlertTriangle className="w-4 h-4" />
        </button>

        {/* Résumé */}
        <button
          onClick={() => setSidePanel(sidePanel === 'summary' ? 'none' : 'summary')}
          className={`btn-ghost p-1.5 ${sidePanel === 'summary' ? 'text-accent' : ''}`}
          title="Résumé de l'itinéraire"
        >
          <BarChart3 className="w-4 h-4" />
        </button>

        {/* Chat IA */}
        <button
          onClick={() => setSidePanel(sidePanel === 'chat' ? 'none' : 'chat')}
          className={`btn-ghost p-1.5 gap-1.5 text-xs ${sidePanel === 'chat' ? 'text-accent' : ''}`}
          title="Assistant IA"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden lg:block">IA</span>
        </button>

        {/* Save indicator */}
        {isSaving && (
          <span className="text-xs text-muted flex items-center gap-1">
            <Save className="w-3 h-3 animate-pulse" />
            <span className="hidden sm:block">Enregistrement…</span>
          </span>
        )}
      </div>

      {/* Mobile search button (small) */}
      {mapsLoaded && (
        <div className="flex md:hidden flex-1 justify-end">
          <SearchBar
            onSelect={handleSearchSelect}
            placeholder="Rechercher…"
            className="max-w-[160px]"
          />
        </div>
      )}
    </header>

    <AnimatePresence>
      {showImport && <ImportGoogleMapsModal onClose={() => setShowImport(false)} />}
    </AnimatePresence>
  </>
  )
}