import { OverlayView } from '@react-google-maps/api'
import type { Waypoint } from '../../types'

const ORDER_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#ec4899', '#14b8a6']

interface Props {
  waypoint: Waypoint
  index: number
  isSelected: boolean
  onSelect: () => void
}

export default function WaypointMarker({ waypoint, index, isSelected, onSelect }: Props) {
  const color = ORDER_COLORS[index % ORDER_COLORS.length]
  const hasCamping = !!waypoint.selectedCamping

  return (
    <OverlayView
      position={{ lat: waypoint.lat, lng: waypoint.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        onClick={onSelect}
        style={{
          transform: 'translate(-50%, -100%)',
          cursor: 'pointer',
          userSelect: 'none',
          position: 'relative',
          display: 'inline-block',
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translate(-50%, -100%) scale(1.15)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translate(-50%, -100%) scale(1)')}
      >
        {/* Pin principal */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            color: '#fff',
            backgroundColor: color,
            border: `2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.4)'}`,
            boxShadow: isSelected
              ? `0 0 0 3px ${color}66, 0 4px 12px rgba(0,0,0,0.5)`
              : '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          {index + 1}
        </div>

        {/* Pointe */}
        <div
          style={{
            width: 8,
            height: 8,
            margin: '-2px auto 0',
            transform: 'rotate(45deg)',
            backgroundColor: color,
          }}
        />

        {/* Indicateur camping */}
        {hasCamping && (
          <div style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 12,
            height: 12,
            backgroundColor: '#4ade80',
            borderRadius: '50%',
            border: '1px solid #0f172a',
            fontSize: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            ⛺
          </div>
        )}

        {/* Tooltip sélection */}
        {isSelected && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '110%',
            backgroundColor: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f1f5f9',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 50,
          }}>
            {waypoint.name}
          </div>
        )}
      </div>
    </OverlayView>
  )
}
