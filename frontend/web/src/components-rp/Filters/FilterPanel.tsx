import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useMapStore } from '../../store/mapStore'
import type { TrailDifficulty } from '../../types'

const DIFFICULTIES: { id: TrailDifficulty; label: string; color: string }[] = [
  { id: 'easy',     label: 'Facile',     color: 'text-green-400 border-green-500/30 bg-green-500/10' },
  { id: 'moderate', label: 'Moyen',      color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
  { id: 'hard',     label: 'Difficile',  color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { id: 'expert',   label: 'Expert',     color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
]

const P4N_TYPES: { id: number; label: string; color: string }[] = [
  { id: 2,  label: 'Parking nuit/jour', color: '#6366f1' },
  { id: 12, label: 'Parking jour seul', color: '#8b5cf6' },
  { id: 16, label: 'Parking CC',        color: '#94a3b8' },
  { id: 10, label: 'Camping',           color: '#f97316' },
  { id: 1,  label: 'Nature',            color: '#22c55e' },
  { id: 3,  label: 'Aire de repos',     color: '#3b82f6' },
  { id: 14, label: 'Services',          color: '#0ea5e9' },
]

export default function FilterPanel() {
  const [open, setOpen] = useState(false)
  const { filter, setFilter, resetFilter } = useMapStore()

  const hasActiveFilters =
    filter.minRating > 0 ||
    filter.maxDistance < 50 ||
    filter.requireParking ||
    filter.requirePool ||
    filter.requireWifi ||
    filter.trailDifficulty.length > 0 ||
    filter.p4nTypes.length > 0

  const toggleDifficulty = (d: TrailDifficulty) => {
    const current = filter.trailDifficulty
    const next = current.includes(d) ? current.filter(x => x !== d) : [...current, d]
    setFilter({ trailDifficulty: next })
  }

  const toggleP4nType = (id: number) => {
    const current = filter.p4nTypes
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    setFilter({ p4nTypes: next })
  }

  return (
    <div className="border-b border-border/20">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted hover:text-slate-300 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Filter className="w-3 h-3" />
          Filtres
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-accent" />
          )}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* Note min */}
              <div>
                <label className="text-xs text-muted block mb-1">
                  Note minimale : {filter.minRating > 0 ? `${filter.minRating}★` : 'Toutes'}
                </label>
                <input
                  type="range" min={0} max={5} step={0.5}
                  value={filter.minRating}
                  onChange={e => setFilter({ minRating: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5"
                />
              </div>

              {/* Distance max */}
              <div>
                <label className="text-xs text-muted block mb-1">
                  Distance max : {filter.maxDistance} km
                </label>
                <input
                  type="range" min={5} max={100} step={5}
                  value={filter.maxDistance}
                  onChange={e => setFilter({ maxDistance: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5"
                />
              </div>

              {/* Équipements */}
              <div>
                <p className="text-xs text-muted mb-1.5">Équipements</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'requireParking' as const, label: 'Parking' },
                    { key: 'requirePool'   as const, label: 'Piscine' },
                    { key: 'requireWifi'   as const, label: 'Wifi' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setFilter({ [key]: !filter[key] })}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors
                        ${filter[key]
                          ? 'bg-accent/20 border-accent/50 text-accent'
                          : 'bg-transparent border-border/30 text-muted hover:border-border'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulté rando */}
              <div>
                <p className="text-xs text-muted mb-1.5">Difficulté randonnée</p>
                <div className="flex flex-wrap gap-1.5">
                  {DIFFICULTIES.map(d => (
                    <button
                      key={d.id}
                      onClick={() => toggleDifficulty(d.id)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors
                        ${filter.trailDifficulty.includes(d.id) ? d.color : 'bg-transparent border-border/30 text-muted'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Types Park4Night */}
              <div>
                <p className="text-xs text-muted mb-1.5">
                  Types Park4Night
                  {filter.p4nTypes.length === 0 && <span className="text-muted/50 ml-1">(tous)</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {P4N_TYPES.map(t => {
                    const active = filter.p4nTypes.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleP4nType(t.id)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          active
                            ? 'text-white border-transparent'
                            : 'bg-transparent border-border/30 text-muted hover:border-border'
                        }`}
                        style={active ? { backgroundColor: t.color, borderColor: t.color } : {}}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {hasActiveFilters && (
                <button onClick={resetFilter} className="text-xs text-muted hover:text-red-400 flex items-center gap-1">
                  <X className="w-3 h-3" /> Réinitialiser les filtres
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
