import { describe, expect, it } from 'vitest';
import { deduplicateEvents, duplicateKey, filterEvents, isFinished, isOngoing } from './events';
import { haversineDistance, estimateTravelMinutes } from './geo';
import { eventAttentionScore, recommendationScore } from './recommend';
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
  it('filters events starting within the next seven days as upcoming', () => {
    const entries = [
      event({ id: 'today' }),
      event({ id: 'soon', startDate: '2026-09-03', endDate: '2026-09-03', startAt: undefined, endAt: undefined }),
      event({ id: 'later', startDate: '2026-09-07', endDate: '2026-09-07', startAt: undefined, endAt: undefined }),
    ];
    expect(filterEvents(entries, 'upcoming', now).map((item) => item.id)).toEqual(['soon']);
  });
  it('tonight excludes multi-day events started before today', () => {
    expect(filterEvents([event({ startDate: '2026-08-29', startAt: '2026-08-29T10:00:00+09:00', endDate: '2026-08-31', endAt: '2026-08-31T22:00:00+09:00' })], 'tonight', now)).toHaveLength(0);
    expect(filterEvents([event()], 'tonight', now)).toHaveLength(1);
    expect(filterEvents([event({ startTime: undefined, endTime: undefined })], 'tonight', now)).toHaveLength(0);
    expect(filterEvents([event({ startDate: '2026-08-30', endDate: '2026-08-30', startTime: '10:00', endTime: '12:00', startAt: '2026-08-30T10:00:00+09:00', endAt: '2026-08-30T12:00:00+09:00' })], 'tonight', new Date('2026-08-30T09:00:00+09:00'))).toHaveLength(0);
    expect(filterEvents([event({ startDate: '2026-08-30', endDate: '2026-09-30', startAt: '2026-08-30T10:00:00+09:00', endAt: '2026-09-30T22:00:00+09:00', startTime: undefined, endTime: undefined })], 'tonight', now)).toHaveLength(0);
    expect(filterEvents([event({ endTime: undefined, endAt: undefined })], 'tonight', now)).toHaveLength(0);
    expect(filterEvents([event({ startTime: undefined, startAt: undefined })], 'tonight', now)).toHaveLength(0);
  });

  it('respects explicit occurrence and closure dates', () => {
    expect(filterEvents([event({ schedule: { closedDates: ['2026-08-30'] } })], 'today', now)).toHaveLength(0);
    expect(filterEvents([event({ startDate: '2026-08-01', endDate: '2026-09-30', schedule: { dates: ['2026-08-31'] } })], 'today', now)).toHaveLength(0);
    expect(filterEvents([event({ startDate: '2026-08-01', endDate: '2026-09-30', schedule: { dates: ['2026-08-30'] } })], 'today', now)).toHaveLength(1);
  });
  it('derives weekend as the next Saturday and Sunday from Osaka local time', () => {
    const monday = new Date('2026-08-31T09:00:00+09:00');
    expect(filterEvents([event({ startDate: '2026-09-05', endDate: '2026-09-05', startAt: undefined, endAt: undefined })], 'weekend', monday)).toHaveLength(1);
    expect(filterEvents([event({ startDate: '2026-09-06', endDate: '2026-09-06', startAt: undefined, endAt: undefined })], 'weekend', monday)).toHaveLength(1);
    expect(filterEvents([event({ startDate: '2026-09-12', endDate: '2026-09-12', startAt: undefined, endAt: undefined })], 'weekend', monday)).toHaveLength(0);
    const sunday = new Date('2026-09-06T09:00:00+09:00');
    expect(filterEvents([event({ startDate: '2026-09-06', endDate: '2026-09-06', startAt: undefined, endAt: undefined })], 'weekend', sunday)).toHaveLength(1);
  });
  it('excludes ended events and handles overnight end', () => {
    expect(isFinished(event({ endAt: '2026-08-30T17:59:59+09:00' }), now)).toBe(true);
    expect(isOngoing(event({ startAt: '2026-08-30T23:00:00+09:00', endAt: '2026-08-31T01:00:00+09:00', endDate: '2026-08-31' }), new Date('2026-08-31T00:30:00+09:00'))).toBe(true);
    const singleDay = event({ endDate: undefined, endAt: undefined, startAt: '2026-08-30T10:00:00+09:00', startTime: '10:00', endTime: undefined });
    expect(isOngoing(singleDay, new Date('2026-08-30T18:00:00+09:00'))).toBe(true);
    expect(isFinished(singleDay, new Date('2026-08-30T23:59:59+09:00'))).toBe(false);
    expect(isFinished(singleDay, new Date('2026-08-31T00:00:00+09:00'))).toBe(true);
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
  it('ranks explicit attention evidence above a plain event', () => {
    const plain = event({ id: 'plain', eventName: '通常イベント' });
    const major = event({ id: 'major', eventName: '大阪フェスティバル', officialUrl: 'https://example.test', imageUrl: 'https://example.test/event.jpg', recommendationEvidence: { scale: 'major', official: true } });
    expect(eventAttentionScore(major, 50, now)).toBeGreaterThan(eventAttentionScore(plain, 50, now));
  });
  it('does not elevate an online-only display on information volume alone', () => {
    const visit = event({ id: 'visit', eventName: '公園フェスティバル', officialUrl: 'https://example.test', imageUrl: 'https://example.test/visit.jpg' });
    const online = event({ id: 'online', eventName: 'デザイン作品展', officialUrl: 'https://example.test', imageUrl: 'https://example.test/online.jpg', description: '応募作品をWEB上で展示します' });
    expect(eventAttentionScore(visit, 50, now)).toBeGreaterThan(eventAttentionScore(online, 50, now));
    expect(eventAttentionScore(online, 50, now)).toBe(0);
  });
  it('keeps promotional sales below comparable public events', () => {
    const publicEvent = event({ eventName: '秋の体験イベント', officialUrl: 'https://example.test', imageUrl: 'https://example.test/image.jpg' });
    const salesEvent = event({ ...publicEvent, id: 'sales', eventName: '秋の体験受注会' });
    expect(eventAttentionScore(publicEvent, 50, now)).toBeGreaterThan(eventAttentionScore(salesEvent, 50, now));
  });
  it('creates destination URLs', () => {
    expect(googleMapsUrl(event())).toContain('destination=34.69%2C135.5');
    expect(appleMapsUrl(event())).toContain('daddr=34.69%2C135.5');
    const unknownPlace = event({ latitude: null, longitude: null, address: '大阪市北区梅田1-1-1' });
    expect(googleMapsUrl(unknownPlace)).toContain(encodeURIComponent('大阪市北区梅田1-1-1'));
    expect(appleMapsUrl(event({ latitude: 0, longitude: 0, venueName: '会場A' }))).toContain(encodeURIComponent('会場A'));
  });
});
