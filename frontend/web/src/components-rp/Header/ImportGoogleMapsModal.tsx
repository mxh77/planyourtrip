import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, MapPin, CheckCircle2, AlertCircle, Loader2, ExternalLink, FileJson } from 'lucide-react'
import { parseGoogleMapsUrl, isGoogleMapsDirectionsUrl } from '../../utils/parseGoogleMapsUrl'
import type { ParsedWaypoint } from '../../utils/parseGoogleMapsUrl'
import { placesApi } from '../../services/api'
import { useItineraryStore } from '../../store/itineraryStore'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
}

type StepState = 'idle' | 'geocoding' | 'importing' | 'done'

interface WaypointStatus {
  wp: ParsedWaypoint
  status: 'pending' | 'geocoding' | 'ok' | 'error'
  resolvedLat?: number
  resolvedLng?: number
  error?: string
}

export default function ImportGoogleMapsModal({ onClose }: Props) {
  const [tab, setTab] = useState<'gmaps' | 'json'>('gmaps')
  const [url, setUrl] = useState('')
  const [itinName, setItinName] = useState('')
  const [parsed, setParsed] = useState<WaypointStatus[] | null>(null)
  const [step, setStep] = useState<StepState>('idle')
  const [progress, setProgress] = useState(0)
  const urlError = url.length > 0 && !isGoogleMapsDirectionsUrl(url)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [jsonPreview, setJsonPreview] = useState<{ name: string; waypointCount: number; raw: unknown } | null>(null)
  const [importingJson, setImportingJson] = useState(false)

  const { createItinerary, addWaypoint } = useItineraryStore.getState()

  // ── Parse URL ────────────────────────────────────────────────────────────────
  const handleParse = () => {
    const waypoints = parseGoogleMapsUrl(url)
    if (waypoints.length === 0) {
      toast.error('Impossible de lire les étapes dans cette URL.')
      return
    }
    // Guess itinerary name from first + last waypoint
    const guessedName = waypoints.length >= 2
      ? `${simplify(waypoints[0].name)} → ${simplify(waypoints[waypoints.length - 1].name)}`
      : simplify(waypoints[0].name)
    setItinName(guessedName)
    setParsed(waypoints.map(wp => ({ wp, status: 'pending' })))
  }

  // ── Geocode waypoints that have no coordinates ────────────────────────────────
  const geocodeAll = async (statuses: WaypointStatus[]): Promise<WaypointStatus[]> => {
    const result = [...statuses]
    for (let i = 0; i < result.length; i++) {
      const s = result[i]
      if (s.wp.lat !== undefined && s.wp.lng !== undefined) {
        result[i] = { ...s, status: 'ok', resolvedLat: s.wp.lat, resolvedLng: s.wp.lng }
      } else {
        result[i] = { ...s, status: 'geocoding' }
        setParsed([...result])
        try {
          const data = await placesApi.geocode(s.wp.name)
          const place = data.result ?? data
          if (!place?.lat) throw new Error('Lieu non trouvé')
          result[i] = { ...s, status: 'ok', resolvedLat: place.lat, resolvedLng: place.lng }
        } catch {
          result[i] = { ...s, status: 'error', error: 'Lieu non trouvé' }
        }
        setParsed([...result])
      }
    }
    return result
  }

  // ── Full import flow ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed) return
    setStep('geocoding')

    const geocoded = await geocodeAll(parsed)
    const valid = geocoded.filter(s => s.status === 'ok')
    if (valid.length === 0) {
      toast.error('Aucune étape valide à importer.')
      setStep('idle')
      return
    }

    setStep('importing')
    setProgress(0)

    try {
      const name = itinName.trim() || 'Itinéraire importé'
      // createItinerary already sets currentItinerary in the store (with waypoints: [])
      await createItinerary(name)

      for (let i = 0; i < valid.length; i++) {
        const s = valid[i]
        await addWaypoint({
          name: s.wp.name,
          lat: s.resolvedLat!,
          lng: s.resolvedLng!,
          nights: 1,
        })
        setProgress(Math.round(((i + 1) / valid.length) * 100))
      }

      setStep('done')
      toast.success(`${valid.length} étapes importées dans « ${name} » !`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur lors de l'import : ${msg}`)
      setStep('idle')
    }
  }

  // ── JSON file handling ────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.waypoints || !Array.isArray(data.waypoints)) throw new Error('Format invalide')
        setJsonPreview({ name: data.name ?? 'Itinéraire importé', waypointCount: data.waypoints.length, raw: data })
      } catch {
        toast.error('Fichier JSON invalide')
      }
    }
    reader.readAsText(file)
  }

  const handleImportJson = async () => {
    if (!jsonPreview) return
    setImportingJson(true)
    try {
      const data = jsonPreview.raw as { name: string; waypoints: Record<string, unknown>[] }
      await createItinerary(data.name)
      for (const wp of data.waypoints) {
        await addWaypoint({
          name: wp.name as string,
          address: wp.address as string | undefined,
          lat: wp.lat as number,
          lng: wp.lng as number,
          nights: (wp.nights as number) ?? 1,
          checkin: wp.checkin as string | null,
          checkout: wp.checkout as string | null,
          notes: wp.notes as string | null,
          campings: wp.campings as [] | undefined,
          trails: wp.trails as [] | undefined,
          pois: wp.pois as [] | undefined,
          selectedCamping: wp.selectedCamping as null | undefined,
        })
      }
      toast.success(`${data.waypoints.length} étapes importées dans « ${data.name} » !`)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur lors de l'import : ${msg}`)
    } finally {
      setImportingJson(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && step === 'idle' && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="card w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-sm">Importer un itinéraire</h2>
          </div>
          {step !== 'importing' && step !== 'geocoding' && !importingJson && (
            <button onClick={onClose} className="btn-ghost p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/30 shrink-0">
          <button
            onClick={() => setTab('gmaps')}
            className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors
              ${tab === 'gmaps' ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-slate-300'}`}
          >
            <MapPin className="w-3.5 h-3.5" /> Google Maps
          </button>
          <button
            onClick={() => setTab('json')}
            className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors
              ${tab === 'json' ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-slate-300'}`}
          >
            <FileJson className="w-3.5 h-3.5" /> Fichier JSON
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {step === 'done' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
              <p className="font-medium">Import terminé !</p>
              <p className="text-sm text-muted">Votre itinéraire a été créé avec succès.</p>
              <button onClick={onClose} className="btn-primary text-sm px-6">Fermer</button>
            </div>
          ) : tab === 'json' ? (
            /* ── JSON file import tab ─────────────────────────────────────── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted font-medium">Fichier JSON exporté depuis RoadTripPlanner</label>
                <div
                  className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-accent/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileJson className="w-8 h-8 text-muted/60" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Glissez votre fichier ou cliquez</p>
                    <p className="text-xs text-muted mt-1">Format .json exporté depuis cette application</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
                </div>
              </div>
              {jsonPreview && (
                <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    Fichier valide
                  </p>
                  <p className="text-xs text-muted">Nom : <span className="text-slate-200">{jsonPreview.name}</span></p>
                  <p className="text-xs text-muted">Étapes : <span className="text-slate-200">{jsonPreview.waypointCount}</span></p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* URL input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted font-medium">URL Google Maps (itinéraire)</label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="url"
                    value={url}
                    onChange={e => { setUrl(e.target.value); setParsed(null) }}
                    placeholder="https://www.google.com/maps/dir/…"
                    className={`input flex-1 text-xs ${urlError ? 'border-red-500/50' : ''}`}
                    disabled={step !== 'idle'}
                  />
                  <button
                    onClick={handleParse}
                    disabled={!url || urlError || step !== 'idle'}
                    className="btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-40"
                  >
                    Analyser
                  </button>
                </div>
                {urlError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    URL Google Maps invalide
                  </p>
                )}
                <p className="text-xs text-muted">
                  Ouvrez votre itinéraire sur{' '}
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline inline-flex items-center gap-0.5"
                  >
                    Google Maps <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  {' '}et copiez l'URL complète.
                </p>
              </div>

              {/* Waypoint preview */}
              {parsed && parsed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted font-medium">{parsed.length} étapes détectées</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {parsed.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs rounded-lg bg-muted/10 px-3 py-1.5">
                        <span className="text-muted font-mono w-5 text-right shrink-0">{i + 1}</span>
                        {s.status === 'geocoding' && <Loader2 className="w-3 h-3 text-accent animate-spin shrink-0" />}
                        {s.status === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                        {s.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                        {s.status === 'pending' && (
                          s.wp.lat !== undefined
                            ? <MapPin className="w-3 h-3 text-accent/60 shrink-0" />
                            : <MapPin className="w-3 h-3 text-muted/40 shrink-0" />
                        )}
                        <span className={`flex-1 truncate ${s.status === 'error' ? 'text-red-400' : ''}`}>
                          {s.wp.name}
                        </span>
                        {s.status === 'pending' && s.wp.lat === undefined && (
                          <span className="text-muted/50 text-[10px] shrink-0">à géocoder</span>
                        )}
                        {s.status === 'error' && (
                          <span className="text-red-400/80 text-[10px] shrink-0">non trouvé</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Itinerary name */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted font-medium">Nom de l'itinéraire</label>
                    <input
                      type="text"
                      value={itinName}
                      onChange={e => setItinName(e.target.value)}
                      placeholder="Mon road trip…"
                      className="input text-sm"
                      disabled={step !== 'idle'}
                    />
                  </div>

                  {/* Import progress */}
                  {(step === 'geocoding' || step === 'importing') && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{step === 'geocoding' ? 'Géocodage en cours…' : `Import… ${progress}%`}</span>
                      </div>
                      {step === 'importing' && (
                        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-accent rounded-full"
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && tab === 'json' && jsonPreview && (
          <div className="p-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
            <button onClick={onClose} disabled={importingJson} className="btn-ghost text-sm px-4 disabled:opacity-40">Annuler</button>
            <button
              onClick={handleImportJson}
              disabled={importingJson}
              className="btn-primary text-sm px-4 flex items-center gap-2 disabled:opacity-40"
            >
              {importingJson
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Import…</>
                : <><Upload className="w-3.5 h-3.5" />Importer {jsonPreview.waypointCount} étapes</>}
            </button>
          </div>
        )}
        {step !== 'done' && tab === 'gmaps' && parsed && parsed.length > 0 && (
          <div className="p-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
            <button
              onClick={onClose}
              disabled={step !== 'idle'}
              className="btn-ghost text-sm px-4 disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              onClick={handleImport}
              disabled={step !== 'idle'}
              className="btn-primary text-sm px-4 flex items-center gap-2 disabled:opacity-40"
            >
              {step === 'idle' ? (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Importer {parsed.length} étapes
                </>
              ) : (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  En cours…
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// Shorten a waypoint name for the itinerary title guess
function simplify(name: string): string {
  // Remove country suffix (", France", ", Italie", etc.)
  return name.replace(/,\s*[A-Za-zÀ-ÿ\s]+$/, '').trim().slice(0, 30)
}
