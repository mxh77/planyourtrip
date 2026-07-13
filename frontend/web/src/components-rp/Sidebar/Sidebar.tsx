import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import WaypointCard from './WaypointCard'
import ItineraryList from './ItineraryList'
import FilterPanel from '../Filters/FilterPanel'
import { useItineraryStore } from '../../store/itineraryStore'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'

type Tab = 'itinerary' | 'list'

export default function Sidebar() {
  const [tab, setTab] = useState<Tab>('itinerary')

  const { currentItinerary, isSaving, isLoading, loadItineraries, reorderWaypoints } = useItineraryStore()
  const { setMode } = useMapStore()
  const { toggleSidebar } = useUIStore()

  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleTabChange = (t: Tab) => {
    setTab(t)
    if (t === 'list') loadItineraries()
  }

  return (
    <div className="h-full flex flex-col bg-surface-900 border-r border-border/50 overflow-hidden">
      {/* Header with close button */}
      <div className="flex items-center border-b border-border/50 shrink-0">
        <div className="flex flex-1">
          {(['itinerary', 'list'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors
                ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-slate-300'}`}
            >
              {t === 'itinerary' ? 'Étapes' : 'Mes itinéraires'}
            </button>
          ))}
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 mr-1 text-muted hover:text-slate-200 transition-colors"
          title="Fermer le volet"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'list' && <ItineraryList />}

        {tab === 'itinerary' && (
          <>
            {!currentItinerary ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-3">
                  <Plus className="w-6 h-6 text-accent/60" />
                </div>
                <p className="text-sm text-muted">Aucun itinéraire sélectionné</p>
                <p className="text-xs text-muted/60 mt-1">Créez ou sélectionnez un itinéraire depuis "Mes itinéraires"</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* En-tête itinéraire actif */}
                <div className="px-3 py-2.5 border-b border-border/30 shrink-0">
                  <h2 className="font-semibold text-sm text-slate-100 truncate">{currentItinerary.name}</h2>
                  <p className="text-xs text-muted mt-0.5">
                    {(currentItinerary.waypoints?.length ?? 0)} étape{(currentItinerary.waypoints?.length ?? 0) !== 1 ? 's' : ''}
                    {currentItinerary.totalDistance
                      ? ` · ${(currentItinerary.totalDistance / 1000).toFixed(0)} km`
                      : ''
                    }
                  </p>
                </div>

                {/* Filtres */}
                <FilterPanel />

                {/* Liste d'étapes */}
                <div className="divide-y divide-border/20">
                  <AnimatePresence initial={false}>
                    {[...currentItinerary.waypoints]
                      .filter(Boolean)
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((wp, i, arr) => (
                        <motion.div
                          key={wp.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          draggable
                          onDragStart={() => { dragIndexRef.current = i }}
                          onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                          onDragLeave={() => setDragOverIndex(null)}
                          onDrop={() => {
                            const from = dragIndexRef.current
                            const to = i
                            setDragOverIndex(null)
                            dragIndexRef.current = null
                            if (from === null || from === to) return
                            const sorted = [...currentItinerary.waypoints]
                              .filter(Boolean)
                              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            const reordered = [...sorted]
                            const [moved] = reordered.splice(from, 1)
                            reordered.splice(to, 0, moved)
                            reorderWaypoints(reordered)
                          }}
                          onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null) }}
                          style={{ cursor: 'default' }}
                        >
                          <WaypointCard
                            waypoint={wp}
                            index={i}
                            isDragOver={dragOverIndex === i && dragIndexRef.current !== i}
                          />
                        </motion.div>
                      ))
                    }
                  </AnimatePresence>
                </div>

                {/* Bouton ajouter */}
                <button
                  onClick={() => setMode('adding-waypoint')}
                  className="mx-3 my-3 btn-ghost border border-dashed border-border/50
                             hover:border-accent/50 hover:text-accent w-auto text-xs gap-2 py-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter une étape
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Indicateur de sauvegarde */}
      <AnimatePresence>
        {isSaving && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-3 py-1.5 border-t border-border/30 text-xs text-muted flex items-center gap-1.5 shrink-0"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Enregistrement…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
