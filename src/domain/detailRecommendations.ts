import type { EventItem } from '../types';
import { isFinished, isOngoing } from './events';
import { calculateDistanceKm } from './geo';
import { hasCoordinates } from './maps';

export type DetailRecommendation = EventItem & { distanceKm?: number };

const normalizePlace = (value?: string) => (value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('ja-JP')
  .replace(/〒?\d{3}-?\d{4}/gu, '')
  .replace(/[\s\u3000\p{P}\p{S}]+/gu, '');

function municipality(value?: string) {
  const text = (value ?? '').normalize('NFKC').replace(/〒?\d{3}-?\d{4}/gu, '').replace(/[\s\u3000]+/gu, '');
  const osakaWard = text.match(/大阪市([^0-9０-９]{1,12}区)/u);
  if (osakaWard) return `大阪市${osakaWard[1]}`;
  const local = text.replace(/^大阪府/u, '').match(/^([^0-9０-９]{1,16}(?:市|町|村))/u);
  return local?.[1] ?? '';
}

function distanceBetween(current: EventItem, candidate: EventItem) {
  if (!hasCoordinates(current) || !hasCoordinates(candidate)) return undefined;
  return calculateDistanceKm(
    { latitude: current.latitude, longitude: current.longitude },
    { latitude: candidate.latitude, longitude: candidate.longitude },
  );
}

function sameVenue(current: EventItem, candidate: EventItem) {
  const currentVenue = normalizePlace(current.venueName);
  return !!currentVenue && currentVenue === normalizePlace(candidate.venueName);
}

function sameAddress(current: EventItem, candidate: EventItem) {
  const currentAddress = normalizePlace(current.address);
  return !!currentAddress && currentAddress === normalizePlace(candidate.address);
}

function sameMunicipality(current: EventItem, candidate: EventItem) {
  const currentArea = municipality(current.address);
  return !!currentArea && currentArea === municipality(candidate.address);
}

function withDistance(current: EventItem, event: EventItem): DetailRecommendation {
  const distanceKm = distanceBetween(current, event);
  return { ...event, ...(distanceKm === undefined ? {} : { distanceKm }) };
}

function byDistanceThenDate(a: DetailRecommendation, b: DetailRecommendation) {
  return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    || a.startDate.localeCompare(b.startDate)
    || a.eventName.localeCompare(b.eventName, 'ja');
}

export function detailRecommendations(current: EventItem, events: EventItem[], now: Date, limit = 3) {
  const available = events.filter((event) => event.id !== current.id && !isFinished(event, now));
  const nearbyOngoing = available
    .filter((event) => {
      if (!isOngoing(event, now)) return false;
      const distance = distanceBetween(current, event);
      return sameVenue(current, event) || sameAddress(current, event) || (distance !== undefined && distance <= 10);
    })
    .map((event) => withDistance(current, event))
    .sort(byDistanceThenDate)
    .slice(0, limit);

  const used = new Set(nearbyOngoing.map((event) => event.id));
  const sameArea = available
    .filter((event) => {
      if (used.has(event.id)) return false;
      const distance = distanceBetween(current, event);
      return sameVenue(current, event)
        || sameAddress(current, event)
        || sameMunicipality(current, event)
        || (distance !== undefined && distance <= 5);
    })
    .map((event) => withDistance(current, event))
    .sort((a, b) => Number(sameVenue(current, b)) - Number(sameVenue(current, a)) || byDistanceThenDate(a, b))
    .slice(0, limit);

  return { nearbyOngoing, sameArea };
}
