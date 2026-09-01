import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useMemo } from 'react'

export interface MapEvent {
  id: string; eventName: string; venueName?: string | null; category?: string | null
  latitude: number; longitude: number; startAt?: string | null; endAt?: string | null
  startDate?: string | null; endDate?: string | null
  displayLabel?: boolean
}
export interface EventMarkerProps { event: MapEvent; selected?: boolean; onSelect?: (event: MapEvent) => void }
const CATEGORY_COLORS: Record<string, string> = { festival:'#ef6351', fireworks:'#8b5cf6', shopping:'#e8893d', zoo:'#3c9b70', aquarium:'#2589bd', amusement:'#e1528c', themePark:'#db4f78', food:'#d28a32', market:'#c87539', fleaMarket:'#ad72b8', exhibition:'#5574c7', museum:'#536b9d', workshop:'#3b9f91', seasonal:'#719c56', illumination:'#ad7c27', night:'#47569a' }
const categoryColor = (category?: string | null) => CATEGORY_COLORS[category ?? ''] ?? '#b06b58'
const categoryMark = (category?: string | null) => ({ festival:'祭', fireworks:'花', shopping:'買', zoo:'動', aquarium:'水', amusement:'遊', themePark:'テ', food:'食', market:'市', fleaMarket:'古', exhibition:'展', museum:'博', workshop:'体', seasonal:'季', illumination:'光', night:'夜' }[category ?? ''] ?? '行')
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character] ?? character)
const eventState = (event: MapEvent) => {
  const now = Date.now(); const start = Date.parse(event.startAt ?? `${event.startDate ?? ''}T00:00:00+09:00`); const end = Date.parse(event.endAt ?? `${event.endDate ?? ''}T23:59:59+09:00`)
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return '開催中'
  if (Number.isFinite(start) && new Date(start).toDateString() === new Date(now).toDateString()) return '今日'
  return ''
}
export function EventMarker({ event, selected = false, onSelect }: EventMarkerProps) {
  const state = eventState(event)
  const icon = useMemo(() => { const color = categoryColor(event.category); const size = selected ? 52 : 44; const label = `${event.eventName}${state ? `（${state}）` : ''}`; const ring = state === '開催中' ? '<span class="event-marker__live" aria-hidden="true"></span>' : ''; return L.divIcon({ className:'event-marker', iconSize:[size,size], iconAnchor:[size/2,size/2], html:`<span class="event-marker__hit" style="--marker-color:${color};--marker-size:${size}px" role="img" aria-label="${escapeHtml(label)}" tabindex="0">${ring}<span class="event-marker__dot" aria-hidden="true"></span><span class="event-marker__mark" aria-hidden="true">${categoryMark(event.category)}</span></span>` }) }, [event.category, event.eventName, selected, state])
  return <Marker position={[event.latitude, event.longitude]} icon={icon} keyboard title={event.eventName} alt={event.eventName} zIndexOffset={selected ? 1000 : state === '開催中' ? 300 : 0} eventHandlers={{ click: () => onSelect?.(event), keypress: (leafletEvent) => { if (leafletEvent.originalEvent instanceof KeyboardEvent && (leafletEvent.originalEvent.key === 'Enter' || leafletEvent.originalEvent.key === ' ')) onSelect?.(event) } }}>
    {(event.displayLabel || selected) && <Tooltip permanent direction="top" offset={[0, -18]} opacity={1} className={`event-marker-label ${state === '開催中' ? 'is-live' : ''}`}>{event.eventName}</Tooltip>}
  </Marker>
}
export { categoryColor }
