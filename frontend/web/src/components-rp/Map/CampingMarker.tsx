import { useState, useRef } from 'react'
import { OverlayView } from '@react-google-maps/api'
import { Tent, Star, ExternalLink, CalendarCheck, Loader2, Check, MapPin } from 'lucide-react'
import type { Camping, ReservationInfo } from '../../types'
import { campingsApi, placesApi } from '../../services/api'
import { useMapStore } from '../../store/mapStore'

type CampingVariant = 'search' | 'favorite' | 'selected'

interface Props {
  camping: Camping
  isSelected: boolean
  variant?: CampingVariant
  isFavorite?: boolean
  onSelect: () => void
  onToggleFavorite?: () => void
  onToggleSelected?: () => void
  onReservationChecked?: (info: ReservationInfo) => void
}

const VARIANT_COLOR: Record<CampingVariant, string> = {
  selected: '#22c55e',
  favorite: '#f59e0b',
  search:   '#3b82f6',
}

export default function CampingMarker({ camping, isSelected, variant = 'search', isFavorite, onSelect, onToggleFavorite, onToggleSelected, onReservationChecked }: Props) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [website, setWebsite] = useState<string | null>(camping.website ?? null)
  const detailsFetched = useRef(false)
  const [resaInfo, setResaInfo] = useState<ReservationInfo | null>(camping.reservationInfo ?? null)
  const [resaLoading, setResaLoading] = useState(false)
  const isHovered = useMapStore(s => s.hoveredCampingId === camping.placeId)

  const checkReservation = async (e: React.MouseEvent) => {
    setResaLoading(true)
    try {
      const result = await campingsApi.checkReservation(website!)
      setResaInfo(result)
      onReservationChecked?.(result)
    } catch {
      setResaInfo({ status: 'error', acceptsReservation: null, message: 'Erreur de connexion', providers: [], signals: [] })
    } finally {
      setResaLoading(false)
    }
  }

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
    // Lazy-load website + details on first hover
    if (!detailsFetched.current && camping.placeId && !website) {
      detailsFetched.current = true
      placesApi.details(camping.placeId).then(d => {
        if (d?.website) setWebsite(d.website)
      }).catch(() => {})
    }
  }
  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }
  const isAvailable = camping.availability?.available === true
  // Couleur selon variante, avec override disponibilité
  const color = isAvailable ? '#22c55e' : VARIANT_COLOR[variant]

  const gmapsUrl = camping.placeId
    ? `https://www.google.com/maps/place/?q=place_id:${camping.placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${camping.lat},${camping.lng}`

  return (
    <OverlayView
      position={{ lat: camping.lat, lng: camping.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        style={{ position: 'relative', transform: 'translate(-50%, -50%)', zIndex: open ? 1000 : isHovered ? 500 : 1 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >

        {/* Popup info */}
        {open && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 14px)',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15,23,42,0.98)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '10px 12px',
              minWidth: 200,
              maxWidth: 250,
              boxShadow: '0 8px 28px rgba(0,0,0,0.7)',
              zIndex: 100,
              whiteSpace: 'nowrap',
              pointerEvents: 'all',
            }}
          >
            {/* Icône + nom */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 7 }}>
              <Tent style={{ color, width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'normal' }}>
                {camping.name}
              </span>
            </div>

            {/* Méta */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 9 }}>
              {camping.rating && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#fbbf24' }}>
                  <Star style={{ width: 10, height: 10 }} />
                  {camping.rating}
                </span>
              )}
              {isAvailable && (
                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 500 }}>✓ Disponible</span>
              )}
              {camping.kampaohId && (
                <span style={{ fontSize: 10, color: '#93c5fd', padding: '1px 5px', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4 }}>
                  Kampaoh
                </span>
              )}
            </div>

            {/* Statut réservation */}
            {resaInfo && (
              <div style={{
                marginBottom: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11,
                backgroundColor: resaInfo.acceptsReservation === true ? 'rgba(34,197,94,0.12)'
                  : resaInfo.acceptsReservation === false ? 'rgba(239,68,68,0.12)' : 'rgba(100,116,139,0.15)',
                border: `1px solid ${resaInfo.acceptsReservation === true ? 'rgba(34,197,94,0.3)' : resaInfo.acceptsReservation === false ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)'}`,
                color: resaInfo.acceptsReservation === true ? '#4ade80' : resaInfo.acceptsReservation === false ? '#f87171' : '#94a3b8',
              }}>
                {resaInfo.acceptsReservation === true ? '✓ ' : resaInfo.acceptsReservation === false ? '✗ ' : '? '}
                {resaInfo.message}
              </div>
            )}

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
                <MapPin style={{ width: 10, height: 10 }} />
                Google Maps
              </a>
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
                    backgroundColor: `${color}18`, color,
                    textDecoration: 'none', border: `1px solid ${color}44`,
                  }}
                >
                  <ExternalLink style={{ width: 10, height: 10 }} />
                  Site web
                </a>
              )}
            </div>

            {/* Bouton sélectionner pour l'étape */}
            {onToggleSelected && (
              <button
                onClick={e => { e.stopPropagation(); onToggleSelected() }}
                style={{
                  marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 11, fontWeight: 500, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.12)',
                  color: isSelected ? '#4ade80' : '#94a3b8',
                  border: `1px solid ${isSelected ? 'rgba(34,197,94,0.35)' : 'rgba(100,116,139,0.3)'}`,
                }}
              >
                <Check style={{ width: 10, height: 10, strokeWidth: 3 }} />
                {isSelected ? 'Désélectionner l\'étape' : 'Sélectionner pour l\'étape'}
              </button>
            )}

            {/* Bouton favori */}
            {onToggleFavorite && (
              <button
                onClick={e => { e.stopPropagation(); onToggleFavorite() }}
                style={{
                  marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 11, fontWeight: 500, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  backgroundColor: isFavorite ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.12)',
                  color: isFavorite ? '#f59e0b' : '#94a3b8',
                  border: `1px solid ${isFavorite ? 'rgba(245,158,11,0.35)' : 'rgba(100,116,139,0.3)'}`,
                }}
              >
                <Star style={{ width: 10, height: 10, fill: isFavorite ? '#f59e0b' : 'none' }} />
                {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              </button>
            )}

            {/* Bouton vérifier réservation */}
            {website && (
              <button
                onClick={checkReservation}
                disabled={resaLoading}
                style={{
                  marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 11, fontWeight: 500, padding: '5px 8px', borderRadius: 6, cursor: resaLoading ? 'default' : 'pointer',
                  backgroundColor: 'rgba(168,85,247,0.12)', color: '#d8b4fe',
                  border: '1px solid rgba(168,85,247,0.3)',
                }}
              >
                {resaLoading
                  ? <><Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> Analyse en cours…</>
                  : <><CalendarCheck style={{ width: 10, height: 10 }} /> Vérifier les réservations</>
                }
              </button>
            )}

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

        {/* Marqueur */}
        <div
          onClick={onSelect}
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          {isSelected && (
            <span
              style={{
                position: 'absolute', inset: -4, borderRadius: '50%',
                backgroundColor: color, opacity: 0.25,
                animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
          )}
          <div
            style={{
              width: isSelected ? 36 : isHovered ? 34 : 28,
              height: isSelected ? 36 : isHovered ? 34 : 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: color,
              border: `${isSelected ? 3 : isHovered ? 2.5 : 2}px solid ${isSelected ? '#ef4444' : 'white'}`,
              boxShadow: isSelected
                ? `0 0 0 3px ${color}88, 0 2px 8px rgba(0,0,0,0.5)`
                : isHovered
                  ? `0 0 0 2px ${color}66, 0 2px 10px rgba(0,0,0,0.6)`
                  : '0 1px 4px rgba(0,0,0,0.5)',
              transition: 'all 0.15s ease',
            }}
          >
            <Tent
              style={{
                color: 'white',
                width: isSelected ? 18 : isHovered ? 17 : 14,
                height: isSelected ? 18 : isHovered ? 17 : 14,
                display: variant === 'selected' || variant === 'favorite' ? 'none' : 'block',
              }}
            />
            {variant === 'favorite' && (
              <Star style={{ color: 'white', width: isHovered ? 17 : 14, height: isHovered ? 17 : 14, fill: 'white' }} />
            )}
            {variant === 'selected' && (
              <Check style={{ color: 'white', width: isHovered ? 17 : 14, height: isHovered ? 17 : 14, strokeWidth: 3 }} />
            )}
          </div>
          {isAvailable && (
            <div style={{
              position: 'absolute', top: -2, right: -2,
              width: 10, height: 10, backgroundColor: '#4ade80',
              borderRadius: '50%', border: '1.5px solid #0f172a',
            }} />
          )}
        </div>
      </div>
    </OverlayView>
  )
}
