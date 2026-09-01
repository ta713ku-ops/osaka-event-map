import type { Coordinates } from '../types';
const R = 6371;
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180, dLat = (b.latitude-a.latitude)*rad, dLon = (b.longitude-a.longitude)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function estimateTravelMinutes(km: number, mode: string = 'train'): number {
  const speed = mode === 'walk' ? 4.5 : mode === 'car' ? 30 : 25;
  return Math.max(1, Math.ceil(km / speed * 60));
}
export const calculateDistanceKm = haversineDistance;
export const estimateTravelTimeMinutes = estimateTravelMinutes;
