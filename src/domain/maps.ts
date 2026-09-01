import type { EventItem } from '../types';
export function googleMapsUrl(event: Pick<EventItem, 'address'|'venueName'|'latitude'|'longitude'>): string {
  const query = event.latitude != null && event.longitude != null ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
export function appleMapsUrl(event: Pick<EventItem, 'address'|'venueName'|'latitude'|'longitude'>): string {
  const query = event.latitude != null && event.longitude != null ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
  return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}`;
}
