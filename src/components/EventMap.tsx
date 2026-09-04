import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { EventMarker, type MapEvent } from './EventMarker'
import { LocateFixed } from 'lucide-react'
import { hasCoordinates } from '../domain/maps'
export interface EventMapProps { events: MapEvent[]; selectedEventId?: string | null; onEventSelect?: (event: MapEvent | null) => void; className?: string }
const OSAKA_CENTER: LatLngExpression = [34.6937, 135.5023]; const OSAKA_ZOOM = 11
function MapInteractions({ onMapClick }: { onMapClick?: () => void }) { useMapEvents({ click: () => onMapClick?.() }); return null }
function LocateControl() { const map = useMap(); const [locating, setLocating] = useState(false); const locate = useCallback(() => { if (!navigator.geolocation) { map.setView(OSAKA_CENTER, OSAKA_ZOOM); return }; setLocating(true); navigator.geolocation.getCurrentPosition(({ coords }) => { map.setView([coords.latitude, coords.longitude], 14); setLocating(false) }, () => { map.setView(OSAKA_CENTER, OSAKA_ZOOM); setLocating(false) }, { enableHighAccuracy:false, timeout:8000, maximumAge:300000 }) }, [map]); return <button type="button" className="map-locate-control" onClick={locate} aria-label="現在地を表示" disabled={locating}>{locating ? <span aria-hidden="true">…</span> : <LocateFixed size={21} aria-hidden="true" />}<span className="sr-only">{locating ? '現在地を確認中' : '現在地'}</span></button> }
const hasMapCoordinates = (event: MapEvent): event is MapEvent & { latitude: number; longitude: number } => hasCoordinates(event);

export function EventMap({ events, selectedEventId, onEventSelect, className }: EventMapProps) {
  const validEvents = useMemo(() => events.filter(hasMapCoordinates), [events]);
  useEffect(() => {
    // An event without coordinates is still a valid list/detail item. Clear only
    // when the selected id no longer exists in the full filtered result set.
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) onEventSelect?.(null);
  }, [events, selectedEventId, onEventSelect]);
  return <div className={`event-map ${className ?? ''}`} data-testid="event-map"><MapContainer center={OSAKA_CENTER} zoom={OSAKA_ZOOM} minZoom={9} maxZoom={17} scrollWheelZoom className="event-map__canvas" attributionControl><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapInteractions onMapClick={() => onEventSelect?.(null)} /><LocateControl />{validEvents.map((event) => <EventMarker key={event.id} event={event} selected={event.id === selectedEventId} onSelect={onEventSelect} />)}</MapContainer></div>
}
export { OSAKA_CENTER, OSAKA_ZOOM }
