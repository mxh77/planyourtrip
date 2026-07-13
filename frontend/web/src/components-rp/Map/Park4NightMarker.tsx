import { useState, useRef } from 'react'
import { OverlayView } from '@react-google-maps/api'
import { Star, ExternalLink, Loader2, CalendarDays, ShoppingBag } from 'lucide-react'
import type { P4NPlace } from '../../types'

interface PlaceDetail {
  images: string[]
  services: string[]
  activities: string[]
  address: { street?: string; zipcode?: string; city?: string; country?: string } | null
  description: string | null
  rating: number | null
  nbRatings: number
  isPro: boolean
  isTop: boolean
  onlineBooking: boolean
}

interface Props {
  place: P4NPlace
}

export default function Park4NightMarker({ place }: Props) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchedRef = useRef(false)

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
    if (fetchedRef.current) return
    fetchedRef.current = true
    // Ne charger les détails que pour les vraies fiches P4N (pas les places Overpass)
    if (!place.url.includes('/place/')) return
    setLoadingDetail(true)
    fetch(`/api/park4night/place/${place.id}?lang=fr`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDetail(data) })
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }
  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  const images = detail?.images?.length ? detail.images : (place.image ? [place.image] : [])
  const services = detail?.services ?? place.services ?? []
  const activities = detail?.activities ?? place.activities ?? []
  const address = detail?.address ?? place.address ?? null
  const description = detail?.description ?? place.description ?? null
  const rating = detail?.rating ?? place.rating ?? null
  const nbRatings = detail?.nbRatings ?? place.nbRatings ?? 0

  return (
    <OverlayView
      position={{ lat: place.lat, lng: place.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ transform: 'translate(-50%, -50%)', zIndex: open ? 1000 : 1 }}
      >
        {/* Marqueur : cercle "P" style Park4Night */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md border border-white/30 cursor-pointer select-none hover:scale-110 transition-transform"
          style={{ backgroundColor: place.typeColor }}
        >
          P
        </div>

        {/* Popup au survol */}
        {open && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-60 bg-slate-800 border border-border rounded-lg shadow-xl overflow-hidden text-xs"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Photo */}
            {images[0] ? (
              <img src={images[0]} alt={place.name} className="w-full h-28 object-cover" />
            ) : loadingDetail ? (
              <div className="w-full h-16 flex items-center justify-center bg-slate-700">
                <Loader2 className="w-4 h-4 text-muted animate-spin" />
              </div>
            ) : null}

            <div className="p-2.5">
              {/* Badge type + badges spéciaux */}
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                  style={{ backgroundColor: place.typeColor }}
                >
                  {place.typeLabel}
                </span>
                {detail?.isTop && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-500 text-white">TOP</span>
                )}
                {detail?.isPro && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">PRO</span>
                )}
                {place.distance != null && (
                  <span className="text-muted text-[10px] ml-auto">{place.distance.toFixed(1)} km</span>
                )}
              </div>

              <p className="font-semibold text-slate-100 leading-tight mb-1">{place.name}</p>

              {/* Adresse */}
              {address?.city && (
                <p className="text-muted text-[10px] mb-1">
                  {[address.street, address.zipcode, address.city].filter(Boolean).join(', ')}
                </p>
              )}

              {description && (
                <p className="text-muted text-[10px] line-clamp-2 mb-1.5">{description}</p>
              )}

              {/* Services */}
              {services.length > 0 && (
                <p className="text-[10px] text-slate-400 mb-1 truncate">
                  {services.slice(0, 4).join(' · ')}
                </p>
              )}

              {/* Activités */}
              {activities.length > 0 && (
                <p className="text-[10px] text-slate-500 mb-1.5 truncate">
                  {activities.slice(0, 3).join(' · ')}
                </p>
              )}

              {/* Réservation en ligne */}
              {detail?.onlineBooking && (
                <div className="flex items-center gap-1 text-[10px] text-green-400 mb-1.5">
                  <CalendarDays className="w-3 h-3" />
                  Réservation en ligne disponible
                </div>
              )}

              <div className="flex items-center justify-between">
                {rating != null && rating > 0 ? (
                  <span className="flex items-center gap-0.5 text-yellow-400">
                    <Star className="w-2.5 h-2.5" />
                    {rating.toFixed(1)}
                    <span className="text-muted ml-0.5">({nbRatings})</span>
                  </span>
                ) : loadingDetail ? (
                  <Loader2 className="w-3 h-3 text-muted animate-spin" />
                ) : <span />}

                <a
                  href={place.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  Park4Night
                </a>
              </div>
            </div>

            {/* Flèche */}
            <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-slate-800 border-r border-b border-border rotate-45" />
          </div>
        )}
      </div>
    </OverlayView>
  )
}
