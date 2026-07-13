import { motion } from 'framer-motion'
import { Route, Clock, Moon, Map, TrendingUp, AlertCircle, Sparkles, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useItineraryStore } from '../../store/itineraryStore'
import { aiApi, directionsApi } from '../../services/api'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ItinerarySummary() {
  const [aiDesc, setAiDesc] = useState('')
  const [loadingDesc, setLoadingDesc] = useState(false)

  const { currentItinerary, calculateRoute, isCalculatingRoute } = useItineraryStore()

  if (!currentItinerary) {
    return (
      <div className="h-full flex items-center justify-center text-center p-6">
        <p className="text-sm text-muted">Sélectionnez un itinéraire pour voir le résumé</p>
      </div>
    )
  }

  const wps = currentItinerary.waypoints
  const totalNights = wps.reduce((acc, wp) => acc + (wp.nights ?? 0), 0)
  const totalDistanceKm = currentItinerary.totalDistance
    ? (currentItinerary.totalDistance / 1000).toFixed(0)
    : null
  const totalDurationH = currentItinerary.totalDuration
    ? Math.floor(currentItinerary.totalDuration / 60)
    : null
  const campingsSelected = wps.filter(w => w.selectedCamping).length
  const campingsFound    = wps.filter(w => (w.campings?.length ?? 0) > 0).length

  const handleGenerateDesc = async () => {
    setLoadingDesc(true)
    try {
      const data = await aiApi.generateDescription(currentItinerary)
      setAiDesc(data.description)
    } catch {
      toast.error('Impossible de générer la description')
    } finally {
      setLoadingDesc(false)
    }
  }

  const handleRecalcRoute = async () => {
    if (wps.length < 2) return toast.error('Ajoutez au moins 2 étapes')
    await calculateRoute()
    toast.success('Route recalculée !')
  }

  return (
    <div className="h-full flex flex-col bg-surface-900 border-l border-border/50 overflow-hidden">
      <div className="panel-header shrink-0">
        <h2 className="text-xs font-semibold text-slate-100">Résumé de l'itinéraire</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Titre */}
        <div className="card p-3">
          <h3 className="font-semibold text-slate-100 text-sm">{currentItinerary.name}</h3>
          {currentItinerary.description && (
            <p className="text-xs text-muted mt-1">{currentItinerary.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: <Route className="w-4 h-4" />,
              label: 'Distance',
              value: totalDistanceKm ? `${totalDistanceKm} km` : '—',
              color: 'text-accent',
            },
            {
              icon: <Clock className="w-4 h-4" />,
              label: 'Temps route',
              value: totalDurationH ? `${totalDurationH}h` : '—',
              color: 'text-blue-400',
            },
            {
              icon: <Moon className="w-4 h-4" />,
              label: 'Nuits',
              value: totalNights.toString(),
              color: 'text-purple-400',
            },
            {
              icon: <Map className="w-4 h-4" />,
              label: 'Étapes',
              value: wps.length.toString(),
              color: 'text-green-400',
            },
          ].map(stat => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-2.5 flex items-center gap-2"
            >
              <div className={stat.color}>{stat.icon}</div>
              <div>
                <p className="text-xs text-muted">{stat.label}</p>
                <p className="text-sm font-semibold text-slate-100">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Campings */}
        <div className="card p-3 space-y-1.5">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Campings</h4>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Trouvés</span>
            <span className="text-slate-300">{campingsFound} étape{campingsFound !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Sélectionnés</span>
            <span className={campingsSelected > 0 ? 'text-green-400' : 'text-slate-300'}>
              {campingsSelected} / {wps.length}
            </span>
          </div>
          {campingsSelected < wps.length && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-2 py-1.5 mt-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {wps.length - campingsSelected} étape(s) sans camping sélectionné
            </div>
          )}
        </div>

        {/* Étapes liste */}
        <div className="card p-3 space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Étapes</h4>
          {[...wps].filter(Boolean).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((wp, i) => (
            <div key={wp.id} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{wp.name}</p>
                <p className="text-[10px] text-muted">
                  {wp.nights} nuit{wp.nights !== 1 ? 's' : ''}
                  {wp.distanceFromPrev ? ` · +${(wp.distanceFromPrev / 1000).toFixed(0)} km` : ''}
                </p>
              </div>
              {wp.selectedCamping && (
                <span className="badge badge-green text-[10px] shrink-0">⛺</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleRecalcRoute}
            disabled={isCalculatingRoute || wps.length < 2}
            className="btn-secondary w-full text-xs gap-2"
          >
            {isCalculatingRoute
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <TrendingUp className="w-3.5 h-3.5" />
            }
            Recalculer la route
          </button>

          <button
            onClick={handleGenerateDesc}
            disabled={loadingDesc}
            className="btn-ghost w-full text-xs border border-dashed border-border/50 gap-2"
          >
            {loadingDesc
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5 text-accent" />
            }
            Générer une description IA
          </button>
        </div>

        {/* Description IA */}
        {aiDesc && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-3"
          >
            <h4 className="text-xs font-semibold text-accent mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Description IA
            </h4>
            <div className="chat-prose text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiDesc}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
