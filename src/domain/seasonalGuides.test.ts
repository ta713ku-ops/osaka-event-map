import { describe, expect, it } from 'vitest';
import { visibleSeasonalGuides } from './seasonalGuides';
import type { SeasonalGuide } from '../types';
import type { EventFilters } from '../components/FilterSheet';
const now = new Date('2026-10-02T06:00:00Z');
const guide = { title: '50万本のコスモス', venueName: 'ハーベストの丘', address: '大阪府堺市南区', validThroughMonth: '2026-11', lastCheckedAt: '2026-10-02T05:00:00Z' } as SeasonalGuide;
describe('official forecasts are separate from dated event search', () => {
  it('is searchable by name and place without an invented occurrence date', () => {
    expect(visibleSeasonalGuides([guide], 'コスモス', 'all', {}, now)).toEqual([guide]);
    expect(visibleSeasonalGuides([guide], 'ハーベスト', 'all', { area: 'sakai' }, now)).toEqual([guide]);
    expect(visibleSeasonalGuides([guide], 'コスモス', 'all', { area: 'hokusetsu' }, now)).toEqual([]);
  });
  it('cannot appear as a confirmed today, tonight, weekend or chosen date result', () => {
    for (const time of ['today', 'tonight', 'tomorrow', 'upcoming', 'weekend'] as const) expect(visibleSeasonalGuides([guide], '', time, {}, now)).toEqual([]);
    const filters: EventFilters[] = [{ selectedDate: '2026-11-01' }, { tags: ['free'] }, { free: true }];
    for (const filter of filters) expect(visibleSeasonalGuides([guide], '', 'all', filter, now)).toEqual([]);
  });
  it('does not display expired or stale forecasts indefinitely', () => {
    expect(visibleSeasonalGuides([guide], '', 'all', {}, new Date('2026-12-01'))).toEqual([]);
    expect(visibleSeasonalGuides([guide], '', 'all', {}, new Date('2026-10-17'))).toEqual([]);
  });
});
