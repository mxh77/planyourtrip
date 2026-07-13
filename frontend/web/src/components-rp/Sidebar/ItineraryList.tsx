import { motion } from 'framer-motion'
import { Plus, Trash2, ArrowRight } from 'lucide-react'
import { useItineraryStore } from '../../store/itineraryStore'
import { useUIStore } from '../../store/uiStore'
import toast from 'react-hot-toast'
import type { Itinerary } from '../../types'

export default function ItineraryList() {
  const { itineraries: rawItineraries, currentItinerary, loadItinerary, deleteItinerary, isLoading } = useItineraryStore()
  const { setSidePanel } = useUIStore()
  const itineraries = rawItineraries ?? []

  const handleSelect = async (it: Itinerary) => {
    await loadItinerary(it.id)
    setSidePanel('chat')
  }

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`Supprimer l'itinéraire "${name}" ?`)) return
    await deleteItinerary(id)
    toast.success('Itinéraire supprimé')
  }

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    )
  }

  if (itineraries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-sm text-muted">Aucun itinéraire</p>
        <p className="text-xs text-muted/60 mt-1">Cliquez sur "Nouveau" dans la barre pour commencer</p>
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1.5">
      {itineraries.filter(Boolean).map((it, i) => (
        <motion.div
          key={it.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => handleSelect(it)}
          className={`card-hover p-3 group ${it.id === currentItinerary?.id ? 'border-accent/40 bg-accent/5' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{it.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {(it._count?.waypoints ?? it.waypoints?.length ?? 0)} étape{(it._count?.waypoints ?? it.waypoints?.length ?? 0) !== 1 ? 's' : ''}
                {it.totalDistance ? ` · ${(it.totalDistance / 1000).toFixed(0)} km` : ''}
              </p>
              <p className="text-xs text-muted/50 mt-0.5">
                {new Date(it.updatedAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => handleDelete(e, it.id, it.name)}
                className="p-1 text-muted hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <ArrowRight className="w-4 h-4 text-muted" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
