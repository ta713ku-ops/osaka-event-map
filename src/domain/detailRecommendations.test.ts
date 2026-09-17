import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types';
import { detailRecommendations } from './detailRecommendations';

const current: EventItem = {
  id: 'current', eventName: '現在のイベント', category: 'exhibition', startDate: '2026-09-01', endDate: '2026-09-30',
  venueName: '大阪南港ATCギャラリー', address: '〒559-0034 大阪市住之江区南港北2-1-10',
};

const event = (id: string, overrides: Partial<EventItem> = {}): EventItem => ({
  id, eventName: `イベント${id}`, category: 'festival', startDate: '2026-09-07', endDate: '2026-09-07',
  venueName: 'ATC海辺のステージ', address: '〒559-0034 大阪市住之江区南港北2-1-10',
  ...overrides,
});

describe('detailRecommendations', () => {
  it('separates ongoing nearby events from upcoming events in the same area', () => {
    const result = detailRecommendations(current, [
      current,
      event('ongoing'),
      event('upcoming', { startDate: '2026-09-13', endDate: '2026-09-13' }),
      event('other-area', { address: '大阪府門真市末広町29-1', venueName: '門真市民文化会館', startDate: '2026-09-13', endDate: '2026-09-13' }),
      event('finished', { startDate: '2026-09-01', endDate: '2026-09-01' }),
    ], new Date('2026-09-07T12:00:00+09:00'));

    expect(result.nearbyOngoing.map((item) => item.id)).toEqual(['ongoing']);
    expect(result.sameArea.map((item) => item.id)).toEqual(['upcoming']);
  });

  it('uses explicit coordinates for nearby events and never repeats a card', () => {
    const locatedCurrent = { ...current, latitude: 34.69, longitude: 135.50 };
    const result = detailRecommendations(locatedCurrent, [
      locatedCurrent,
      event('near', { latitude: 34.70, longitude: 135.50 }),
      event('far', { latitude: 35.70, longitude: 135.50, address: '大阪府外', venueName: '遠方会場' }),
    ], new Date('2026-09-07T12:00:00+09:00'));

    expect(result.nearbyOngoing.map((item) => item.id)).toEqual(['near']);
    expect(result.sameArea).toHaveLength(0);
  });
});
