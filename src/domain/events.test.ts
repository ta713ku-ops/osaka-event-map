import { describe, expect, it } from 'vitest';
import { deduplicateEvents, duplicateKey, filterEvents, isFinished, isOngoing } from './events';
import { haversineDistance, estimateTravelMinutes } from './geo';
import { recommendationScore } from './recommend';
import { appleMapsUrl, googleMapsUrl } from './maps';
import type { EventItem } from '../types';

const now = new Date('2026-08-30T18:00:00+09:00');
const event = (overrides: Partial<EventItem> = {}): EventItem => ({ id: 'x', eventName: 'イベント', category: '祭り', startDate: '2026-08-30', endDate: '2026-08-30', startTime: '17:00', endTime: '21:00', startAt: '2026-08-30T17:00:00+09:00', endAt: '2026-08-30T21:00:00+09:00', latitude: 34.69, longitude: 135.50, ...overrides });

describe('event time filters', () => {
  it('filters today, tomorrow and weekend', () => {
    expect(filterEvents([event(), event({ id: 't', startDate: '2026-08-31', endDate: '2026-08-31', startAt: '2026-08-31T10:00:00+09:00', endAt: '2026-08-31T12:00:00+09:00' })], 'today', now)).toHaveLength(1);
    expect(filterEvents([event({ id: 't', startDate: '2026-08-31', endDate: '2026-08-31', startAt: '2026-08-31T10:00:00+09:00', endAt: '2026-08-31T12:00:00+09:00' })], 'tomorrow', now)).toHaveLength(1);
    expect(filterEvents([event()], 'weekend', now)).toHaveLength(1);
  });
  it('tonight excludes multi-day events started before today', () => {
    expect(filterEvents([event({ startDate: '2026-08-29', startAt: '2026-08-29T10:00:00+09:00', endDate: '2026-08-31', endAt: '2026-08-31T22:00:00+09:00' })], 'tonight', now)).toHaveLength(0);
    expect(filterEvents([event()], 'tonight', now)).toHaveLength(1);
    expect(filterEvents([event({ startTime: undefined, endTime: undefined })], 'tonight', now)).toHaveLength(0);
  });
  it('excludes ended events and handles overnight end', () => {
    expect(isFinished(event({ endAt: '2026-08-30T17:59:59+09:00' }), now)).toBe(true);
    expect(isOngoing(event({ startAt: '2026-08-30T23:00:00+09:00', endAt: '2026-08-31T01:00:00+09:00', endDate: '2026-08-31' }), new Date('2026-08-31T00:30:00+09:00'))).toBe(true);
  });
  it('does not treat unknown time as a timed or tonight event', () => {
    const unknown = event({ startTime: undefined, endTime: undefined, startAt: undefined, endAt: undefined });
    expect(filterEvents([unknown], 'tonight', now)).toHaveLength(0);
  });
  it('accepts a cross-midnight event when its end is after midnight', () => {
    const overnight = event({ startTime: '23:00', endTime: '01:00', startAt: '2026-08-30T23:00:00+09:00', endAt: '2026-08-31T01:00:00+09:00', endDate: '2026-08-31' });
    expect(isOngoing(overnight, new Date('2026-08-31T00:30:00+09:00'))).toBe(true);
  });
});

describe('domain helpers', () => {
  it('calculates distance and travel time', () => {
    expect(haversineDistance({ latitude: 34.6937, longitude: 135.5023 }, { latitude: 34.6937, longitude: 135.5023 })).toBe(0);
    expect(estimateTravelMinutes(4.5, 'walk')).toBe(60);
  });
  it('scores recommendation and normalizes duplicate keys', () => {
    expect(recommendationScore(event({ category: '祭り', childFriendly: true }), { favoriteCategories: ['祭り'], hasChildren: true })).toBeGreaterThan(80);
    const a = event({ eventName: 'ＡＢＣ！', venueName: '会場　', address: '大阪市。' });
    const b = event({ eventName: 'ABC', venueName: '会場', address: '大阪市' });
    expect(duplicateKey(a)).toBe(duplicateKey(b));
    expect(deduplicateEvents([a, b])).toHaveLength(1);
  });
  it('creates destination URLs', () => {
    expect(googleMapsUrl(event())).toContain('destination=34.69%2C135.5');
    expect(appleMapsUrl(event())).toContain('daddr=34.69%2C135.5');
  });
});
