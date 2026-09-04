import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useMemo } from 'react'

export interface MapEvent {
  id: string; eventName: string; venueName?: string | null; category?: string | null
  latitude?: number | null; longitude?: number | null; startAt?: string | null; endAt?: string | null
  startDate?: string | null; endDate?: string | null; startTime?: string | null; endTime?: string | null
  displayLabel?: boolean
}
export type MappableEvent = MapEvent & { latitude: number; longitude: number };
export interface EventMarkerProps { event: MappableEvent; selected?: boolean; onSelect?: (event: MapEvent) => void }
const CATEGORY_COLORS: Record<string, string> = { festival:'#ef6351', fireworks:'#8b5cf6', shopping:'#e8893d', zoo:'#3c9b70', aquarium:'#2589bd', amusement:'#e1528c', themePark:'#db4f78', food:'#d28a32', market:'#c87539', fleaMarket:'#ad72b8', exhibition:'#5574c7', museum:'#536b9d', workshop:'#3b9f91', seasonal:'#719c56', illumination:'#ad7c27', night:'#47569a', music:'#a85b88', theater:'#7a5a9d', sports:'#4f8792' }
const categoryColor = (category?: string | null) => CATEGORY_COLORS[category ?? ''] ?? '#b06b58'
const categoryMark = (category?: string | null) => ({ festival:'祭', fireworks:'花', shopping:'買', zoo:'動', aquarium:'水', amusement:'遊', themePark:'テ', food:'食', market:'市', fleaMarket:'古', exhibition:'展', museum:'博', workshop:'体', seasonal:'季', illumination:'光', night:'夜', music:'音', theater:'演', sports:'ス' }[category ?? ''] ?? '行')
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character] ?? character)
const eventState = (event: MapEvent) => {
  const now = Date.now(); const start = Date.parse(event.startAt ?? `${event.startDate ?? ''}T${(event.startTime ?? '00:00').slice(0, 5)}:00+09:00`); let end = Date.parse(event.endAt ?? `${event.endDate ?? event.startDate ?? ''}T${(event.endTime ?? '23:59').slice(0, 5)}:59+09:00`)
  if (!event.endDate && Number.isFinite(start) && Number.isFinite(end) && end < start) end += 86400000;
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return '開催中'
  if (Number.isFinite(start) && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(start)) === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now))) return '今日'
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
