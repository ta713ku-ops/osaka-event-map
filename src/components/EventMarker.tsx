import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'

export interface MapEvent {
  id: string; eventName: string; venueName?: string | null; category?: string | null
  latitude?: number | null; longitude?: number | null; startAt?: string | null; endAt?: string | null
  startDate?: string | null; endDate?: string | null; startTime?: string | null; endTime?: string | null
  displayLabel?: boolean
}
export type MappableEvent = MapEvent & { latitude: number; longitude: number }
export interface EventMarkerProps { event: MappableEvent; onSelect?: (event: MapEvent) => void }

const CATEGORY_COLORS: Record<string, string> = { festival: '#ef6351', fireworks: '#8b5cf6', shopping: '#e8893d', zoo: '#3c9b70', aquarium: '#2589bd', amusement: '#e1528c', themePark: '#db4f78', food: '#d28a32', market: '#c87539', fleaMarket: '#ad72b8', exhibition: '#5574c7', museum: '#536b9d', workshop: '#3b9f91', seasonal: '#719c56', illumination: '#ad7c27', night: '#47569a', music: '#a85b88', theater: '#7a5a9d', sports: '#4f8792' }
const categoryColor = (category?: string | null) => CATEGORY_COLORS[category ?? ''] ?? '#b06b58'
const categoryMark = (category?: string | null) => ({ festival: '祭', fireworks: '花', shopping: '買', zoo: '動', aquarium: '水', amusement: '遊', themePark: 'テ', food: '食', market: '市', fleaMarket: '古', exhibition: '展', museum: '博', workshop: '体', seasonal: '季', illumination: '光', night: '夜', music: '音', theater: '演', sports: 'ス' }[category ?? ''] ?? '行')

const eventState = (event: MapEvent) => {
  const now = Date.now()
  const start = Date.parse(event.startAt ?? `${event.startDate ?? ''}T${(event.startTime ?? '00:00').slice(0, 5)}:00+09:00`)
  let end = Date.parse(event.endAt ?? `${event.endDate ?? event.startDate ?? ''}T${(event.endTime ?? '23:59').slice(0, 5)}:59+09:00`)
  if (!event.endDate && Number.isFinite(start) && Number.isFinite(end) && end < start) end += 86400000
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return '開催中'
  if (Number.isFinite(start) && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(start)) === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now))) return '今日'
  return ''
}

export function EventMarker({ event, onSelect }: EventMarkerProps) {
  const markerRef = useRef<L.Marker | null>(null)
  const state = eventState(event)
  const label = `${event.eventName}${state ? `（${state}）` : ''}`
  const icon = useMemo(() => {
    const color = categoryColor(event.category)
    const size = 44
    const ring = state === '開催中' ? '<span class="event-marker__live" aria-hidden="true"></span>' : ''
    return L.divIcon({
      className: 'event-marker',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span class="event-marker__hit" style="--marker-color:${color};--marker-size:${size}px" aria-hidden="true">${ring}<span class="event-marker__dot" aria-hidden="true"></span><span class="event-marker__mark" aria-hidden="true">${categoryMark(event.category)}</span></span>`,
    })
  }, [event.category, state])

  useEffect(() => {
    const element = markerRef.current?.getElement()
    if (!element) return

    // Leaflet's marker element is the single keyboard focus target. The icon's
    // inner span is only visual, so parent focus restoration can target this DOM.
    element.setAttribute('data-event-focus', `map-pin:${event.id}`)
    element.setAttribute('aria-label', label)
    element.setAttribute('role', 'button')
    element.tabIndex = 0

    const activateOnKeyDown = (nativeEvent: KeyboardEvent) => {
      if (nativeEvent.key !== 'Enter' && nativeEvent.key !== ' ' && nativeEvent.key !== 'Spacebar') return
      nativeEvent.preventDefault()
      nativeEvent.stopPropagation()
      if (!nativeEvent.repeat) markerRef.current?.fire('click')
    }
    element.addEventListener('keydown', activateOnKeyDown)
    return () => element.removeEventListener('keydown', activateOnKeyDown)
  }, [event.id, event.category, icon, label])

  return <Marker
    ref={markerRef}
    position={[event.latitude, event.longitude]}
    icon={icon}
    keyboard
    zIndexOffset={state === '開催中' ? 300 : 0}
    title={label}
    alt={label}
    eventHandlers={{ click: () => onSelect?.(event) }}
  >
    {event.displayLabel && <Tooltip permanent direction="top" offset={[0, -18]} opacity={1} className={`event-marker-label ${state === '開催中' ? 'is-live' : ''}`}>{event.eventName}</Tooltip>}
  </Marker>
}

export { categoryColor }
