import type { EventItem } from '../types';
type CoordinateFields = Pick<EventItem, 'latitude'|'longitude'>;
function hasCoordinates<T extends CoordinateFields>(event: T): event is T & { latitude: number; longitude: number } {
  return Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
    && Math.abs(event.latitude as number) <= 90
    && Math.abs(event.longitude as number) <= 180
    && !(event.latitude === 0 && event.longitude === 0);
}
export function googleMapsUrl(event: Pick<EventItem, 'address'|'venueName'|'latitude'|'longitude'>): string {
  const query = hasCoordinates(event) ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
export function appleMapsUrl(event: Pick<EventItem, 'address'|'venueName'|'latitude'|'longitude'>): string {
  const query = hasCoordinates(event) ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
  return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}`;
}

export { hasCoordinates };
