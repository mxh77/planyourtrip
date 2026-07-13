import { useState, useRef } from 'react'
import { OverlayView } from '@react-google-maps/api'
import { Footprints, ExternalLink, Map, Mountain, Clock, TrendingUp, Star } from 'lucide-react'
import type { Trail } from '../../types'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:     '#22c55e',
  moderate: '#f59e0b',
  hard:     '#ef4444',
  expert:   '#7c3aed',
  unknown:  '#64748b',
}

const DIFFICULTY_BG: Record<string, string> = {
  easy:     '#16a34a',
  moderate: '#d97706',
  hard:     '#dc2626',
  expert:   '#6d28d9',
  unknown:  '#475569',
}

interface Props {
  trail: Trail
  isSelected: boolean
  onSelect: () => void
  isFavorite?: boolean
}

export default function TrailOverlay({ trail, isSelected, onSelect, isFavorite = false }: Props) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }
  const color = DIFFICULTY_COLORS[trail.difficulty] ?? '#64748b'
  const bgColor = DIFFICULTY_BG[trail.difficulty] ?? '#475569'
  const isGoogle = trail.source === 'google'

  const gmapsUrl = trail.gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${trail.lat},${trail.lng}`

  return (
    <OverlayView
      position={{ lat: trail.lat, lng: trail.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        style={{ position: 'relative', transform: 'translate(-50%, -50%)' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >

        {/* Popup info */}
        {open && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15,23,42,0.98)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '10px 12px',
              minWidth: 210,
              maxWidth: 260,
              boxShadow: '0 8px 28px rgba(0,0,0,0.7)',
              zIndex: 100,
              whiteSpace: 'nowrap',
              pointerEvents: 'all',
            }}
          >
            {/* Nom + badge difficulté */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 7 }}>
              <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'normal', flex: 1 }}>
                {trail.name}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                {isGoogle ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                    backgroundColor: '#1a73e8', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.03em',
                  }}>
                    Google
                  </span>
                ) : (
                  trail.difficulty !== 'unknown' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                      backgroundColor: bgColor, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                      {trail.difficultyLabel}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Méta */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 9 }}>
              {trail.rating && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#fbbf24' }}>
                  <Star style={{ width: 10, height: 10 }} />
                  {trail.rating.toFixed(1)}{trail.userRatingsTotal ? ` (${trail.userRatingsTotal})` : ''}
                </span>
              )}
              {trail.distance && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                  <Mountain style={{ width: 10, height: 10 }} />
                  {trail.distance.toFixed(1)} km
                </span>
              )}
              {trail.duration && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                  <Clock style={{ width: 10, height: 10 }} />
                  {trail.durationLabel}
                </span>
              )}
              {trail.ascent && trail.ascent > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}>
                  <TrendingUp style={{ width: 10, height: 10 }} />
                  +{trail.ascent} m
                </span>
              )}
            </div>

            {/* Liens */}
            <div style={{ display: 'flex', gap: 6 }}>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
                  backgroundColor: '#1e40af', color: '#bfdbfe', textDecoration: 'none',
                  border: '1px solid rgba(59,130,246,0.3)',
                }}
              >
                <Map style={{ width: 10, height: 10 }} />
                Google Maps
              </a>
              {(trail.waymarkedUrl || trail.osmUrl) && (
                <a
                  href={trail.waymarkedUrl || trail.osmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
                    backgroundColor: 'rgba(34,197,94,0.12)', color: '#86efac', textDecoration: 'none',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  <ExternalLink style={{ width: 10, height: 10 }} />
                  Détails
                </a>
              )}
            </div>

            {/* Flèche */}
            <div style={{
              position: 'absolute', bottom: -6, left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: 12, height: 12,
              backgroundColor: 'rgba(15,23,42,0.98)',
              borderRight: '1px solid rgba(255,255,255,0.12)',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
            }} />
          </div>
        )}

        {/* Marqueur principal */}
        <div
          onClick={onSelect}
          style={{
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
            transform: isSelected ? 'scale(1.25)' : 'scale(1)',
          }}
        >
          {/* Halo quand sélectionné */}
          {isSelected && (
            <span style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              backgroundColor: color, opacity: 0.25,
              animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
            }} />
          )}
          <div
            style={{
              width: isSelected ? 32 : 26,
              height: isSelected ? 32 : 26,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isGoogle
                ? (isSelected ? '#1a73e844' : '#1a73e820')
                : `${color}28`,
              border: `${isSelected ? 3 : 2}px solid ${isSelected ? '#ef4444' : (isGoogle ? '#1a73e8' : color)}`,
              boxShadow: isSelected
                ? `0 0 0 3px #ef444444, 0 4px 12px rgba(0,0,0,0.6)`
                : '0 2px 6px rgba(0,0,0,0.5)',
            }}
          >
            <Mountain style={{ color: isGoogle ? '#1a73e8' : color, width: isSelected ? 16 : 13, height: isSelected ? 16 : 13 }} />
          </div>
          {/* Badge favori */}
          {isFavorite && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              width: 14, height: 14, borderRadius: '50%',
              backgroundColor: '#f59e0b',
              border: '1.5px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Star style={{ width: 8, height: 8, color: '#fff', fill: '#fff' }} />
            </div>
          )}
        </div>
      </div>
    </OverlayView>
  )
}
