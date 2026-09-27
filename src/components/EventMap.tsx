import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { EventMarker, type MapEvent } from './EventMarker'
import { LocateFixed } from 'lucide-react'
import { hasCoordinates } from '../domain/maps'
import type { MapViewport } from '../domain/navigationState'

export type { MapViewport } from '../domain/navigationState'

export interface EventMapProps {
  events: MapEvent[]
  onEventSelect?: (event: MapEvent) => void
  className?: string
  viewport?: MapViewport
  onViewportChange?: (viewport: MapViewport) => void
  active?: boolean
}

const OSAKA_CENTER: LatLngExpression = [34.6937, 135.5023]
const OSAKA_ZOOM = 11

const hasMapCoordinates = (event: MapEvent): event is MapEvent & { latitude: number; longitude: number } => hasCoordinates(event)

function readViewport(map: L.Map): MapViewport {
  const center = map.getCenter()
  return { latitude: center.lat, longitude: center.lng, zoom: map.getZoom() }
}

function sameViewport(left: MapViewport, right: MapViewport): boolean {
  return Math.abs(left.latitude - right.latitude) < 1e-6
    && Math.abs(left.longitude - right.longitude) < 1e-6
    && Math.abs(left.zoom - right.zoom) < 1e-4
}

function MapViewportController({
  viewport,
  onViewportChange,
  active,
}: Pick<EventMapProps, 'viewport' | 'onViewportChange' | 'active'>) {
  const map = useMap()
  const viewportRef = useRef(viewport)
  const onViewportChangeRef = useRef(onViewportChange)
  const activeRef = useRef(active)
  const lastReportedViewportRef = useRef<MapViewport | null>(null)
  const suppressViewportEventsRef = useRef(false)
  const wasActiveRef = useRef(active)

  viewportRef.current = viewport
  onViewportChangeRef.current = onViewportChange
  activeRef.current = active

  const reportViewport = useCallback(() => {
    if (!activeRef.current || suppressViewportEventsRef.current) return

    const next = readViewport(map)
    const controlledViewport = viewportRef.current
    if (controlledViewport && sameViewport(next, controlledViewport)) {
      lastReportedViewportRef.current = next
      return
    }
    if (lastReportedViewportRef.current && sameViewport(next, lastReportedViewportRef.current)) return

    lastReportedViewportRef.current = next
    onViewportChangeRef.current?.(next)
  }, [map])

  useEffect(() => {
    const initial = readViewport(map)
    lastReportedViewportRef.current = initial
    map.on('moveend', reportViewport)
    map.on('zoomend', reportViewport)
    return () => {
      map.off('moveend', reportViewport)
      map.off('zoomend', reportViewport)
    }
  }, [map, reportViewport])

  useEffect(() => {
    const container = map.getContainer()
    container.tabIndex = 0
    container.setAttribute('role', 'region')
    container.setAttribute('aria-label', '大阪のイベント地図')
  }, [map])

  useEffect(() => {
    if (!viewport) return
    const current = readViewport(map)
    if (sameViewport(current, viewport)) return

    // Set the deduplication baseline before Leaflet emits moveend/zoomend.
    lastReportedViewportRef.current = viewport
    map.setView([viewport.latitude, viewport.longitude], viewport.zoom, { animate: false })
  }, [map, viewport?.latitude, viewport?.longitude, viewport?.zoom])

  useEffect(() => {
    if (!active) {
      wasActiveRef.current = false
      return
    }
    if (wasActiveRef.current) return

    wasActiveRef.current = true
    // `getCenter()` can be wrong while Leaflet still has the hidden element's
    // old dimensions cached. Restore from the controlled viewport (or last
    // reported view) after recalculating the visible size.
    const restoreViewport = viewportRef.current ?? lastReportedViewportRef.current ?? readViewport(map)
    suppressViewportEventsRef.current = true
    try {
      map.invalidateSize({ pan: false, animate: false })
      map.setView([restoreViewport.latitude, restoreViewport.longitude], restoreViewport.zoom, { animate: false })
    } finally {
      lastReportedViewportRef.current = readViewport(map)
      suppressViewportEventsRef.current = false
    }
  }, [active, map])

  return null
}

function LocateControl() {
  const map = useMap()
  const [locating, setLocating] = useState(false)
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      map.setView(OSAKA_CENTER, OSAKA_ZOOM)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map.setView([coords.latitude, coords.longitude], 14)
      setLocating(false)
    }, () => {
      map.setView(OSAKA_CENTER, OSAKA_ZOOM)
      setLocating(false)
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 })
  }, [map])

  return <button type="button" className="map-locate-control" onClick={locate} aria-label="現在地を表示" disabled={locating}>
    {locating ? <span aria-hidden="true">…</span> : <LocateFixed size={21} aria-hidden="true" />}
    <span className="sr-only">{locating ? '現在地を確認中' : '現在地'}</span>
  </button>
}

export function EventMap({ events, onEventSelect, className, viewport, onViewportChange, active = true }: EventMapProps) {
  const validEvents = useMemo(() => events.filter(hasMapCoordinates), [events])
  const center: LatLngExpression = viewport ? [viewport.latitude, viewport.longitude] : OSAKA_CENTER
  const zoom = viewport?.zoom ?? OSAKA_ZOOM

  return <div className={`event-map ${className ?? ''}`} data-testid="event-map">
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={9}
      maxZoom={17}
      scrollWheelZoom
      className="event-map__canvas"
      attributionControl
    >
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapViewportController viewport={viewport} onViewportChange={onViewportChange} active={active} />
      <LocateControl />
      {validEvents.map((event) => <EventMarker key={event.id} event={event} onSelect={onEventSelect} />)}
    </MapContainer>
  </div>
}

export { OSAKA_CENTER, OSAKA_ZOOM }
