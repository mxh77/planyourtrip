import { OverlayView } from '@react-google-maps/api'
import { MapPin } from 'lucide-react'
import type { Place } from '../../types'

interface Props {
  place: Place
  isSelected?: boolean
  onClick?: (place: Place) => void
}

export default function POIMarker({ place, isSelected, onClick }: Props) {
  return (
    <OverlayView
      position={{ lat: place.lat, lng: place.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className="cursor-pointer hover:scale-110 transition-transform"
        style={{ transform: 'translate(-50%,-50%)' }}
        title={place.name}
        onClick={() => onClick?.(place)}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 shadow-md transition-colors
          ${isSelected
            ? 'bg-purple-500 border-red-500'
            : 'bg-purple-500/20 border-purple-500 hover:bg-purple-500/40'}`}>
          <MapPin className="w-3 h-3 text-purple-100" />
        </div>
        {isSelected && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap
            bg-slate-900 text-purple-200 text-[10px] px-1.5 py-0.5 rounded shadow pointer-events-none">
            {place.name}
          </div>
        )}
      </div>
    </OverlayView>
  )
}
