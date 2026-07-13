import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle, CheckCircle, Info, X, AlertOctagon, ArrowRight,
} from "lucide-react"
import { useItineraryStore } from "../../store/itineraryStore"

interface Issue {
  id: string
  type: "error" | "warning" | "suggestion"
  message: string
  step?: string
  severity?: "high" | "medium" | "low"
}

export default function ChecklistPanel() {
  const { currentItinerary } = useItineraryStore()

  const issues: Issue[] = useMemo(() => {
    const result: Issue[] = []
    if (!currentItinerary) return result

    const waypoints = currentItinerary.waypoints ?? []

    // Vérifier les chevauchements de dates
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]
      const b = waypoints[i + 1]
      if (a.checkout && b.checkin) {
        const outD = new Date(a.checkout)
        const inD = new Date(b.checkin)
        if (outD > inD) {
          result.push({
            id: `overlap-${a.id}`,
            type: "error",
            severity: "high",
            message: `Chevauchement de dates entre "${a.name}" (départ ${a.checkout}) et "${b.name}" (arrivée ${b.checkin})`,
            step: a.name,
          })
        }
      }
    }

    // Vérifier les étapes sans camping assigné
    waypoints.forEach((wp) => {
      if (!wp.selectedCamping) {
        result.push({
          id: `nocamping-${wp.id}`,
          type: "warning",
          severity: "medium",
          message: `Pas de camping sélectionné pour "${wp.name}"`,
          step: wp.name,
        })
      }
    })

    // Vérifier les campings sans réservation
    waypoints.forEach((wp) => {
      if (wp.selectedCamping) {
        const camping = typeof wp.selectedCamping === "string"
          ? JSON.parse(wp.selectedCamping)
          : wp.selectedCamping
        if (camping && !camping.bookingRef) {
          result.push({
            id: `nobooking-${wp.id}`,
            type: "suggestion",
            severity: "low",
            message: `Camping "${camping.name || wp.name}" sans numéro de réservation`,
            step: wp.name,
          })
        }
      }
    })

    // Vérifier les notes vides
    waypoints.forEach((wp) => {
      if (!wp.notes || wp.notes.trim() === "") {
        result.push({
          id: `nonotes-${wp.id}`,
          type: "suggestion",
          severity: "low",
          message: `Aucune note pour "${wp.name}"`,
          step: wp.name,
        })
      }
    })

    return result
  }, [currentItinerary])

  const errors = issues.filter(i => i.type === "error")
  const warnings = issues.filter(i => i.type === "warning")
  const suggestions = issues.filter(i => i.type === "suggestion")

  const allClear = issues.length === 0

  return (
    <div className="flex flex-col h-full bg-surface-900">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/30">
        <h2 className="text-sm font-bold text-slate-100">Vérification de l'itinéraire</h2>
        {currentItinerary && (
          <p className="text-[10px] text-muted truncate mt-0.5">{currentItinerary.name}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!currentItinerary && (
          <div className="text-center py-12 text-muted text-sm">
            Aucun itinéraire sélectionné
          </div>
        )}

        {currentItinerary && allClear && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center gap-3 text-center py-12"
          >
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-sm font-semibold text-green-400">Tout est en ordre !</p>
            <p className="text-xs text-muted">Aucun problème détecté sur cet itinéraire.</p>
          </motion.div>
        )}

        {errors.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wide">
                Erreurs ({errors.length})
              </span>
            </div>
            <div className="space-y-2">
              {errors.map(issue => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        )}

        {warnings.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                Avertissements ({warnings.length})
              </span>
            </div>
            <div className="space-y-2">
              {warnings.map(issue => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        )}

        {suggestions.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">
                Suggestions ({suggestions.length})
              </span>
            </div>
            <div className="space-y-2">
              {suggestions.map(issue => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2 border-t border-border/30 text-[10px] text-muted flex items-center gap-1.5">
        <Info className="w-3 h-3" />
        Mis à jour en temps réel
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  const borderColor = {
    error: "border-red-500/30 bg-red-500/8",
    warning: "border-amber-500/30 bg-amber-500/8",
    suggestion: "border-blue-500/30 bg-blue-500/8",
  }[issue.type]

  const iconColor = {
    error: "text-red-400",
    warning: "text-amber-400",
    suggestion: "text-blue-400",
  }[issue.type]

  return (
    <div className={`rounded-lg border ${borderColor} p-2.5`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <p className="text-xs text-slate-200">{issue.message}</p>
          {issue.step && (
            <p className="text-[10px] text-muted mt-0.5">Étape : {issue.step}</p>
          )}
        </div>
      </div>
    </div>
  )
}