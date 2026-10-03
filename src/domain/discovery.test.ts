import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types';
import { editorialFeatures } from './discovery';

const event = (eventName: string, extra: Partial<EventItem> = {}): EventItem => ({
  id: eventName,
  eventName,
  category: 'festival',
  startDate: '2026-10-10',
  officialUrl: 'https://example.test/event',
  ...extra,
});

describe('editorialFeatures', () => {
  it('uses seasonal copy grounded in event names without describing collection methods', () => {
    const [feature] = editorialFeatures([
      event('中之島の紅葉散歩'),
      event('天満のハロウィン祭'),
    ], new Date('2026-10-01T12:00:00+09:00'));

    expect(feature.title).toBe('秋のよりみち');
    expect(feature.description).toContain('紅葉やハロウィン');
    expect(feature.description).not.toContain('集めました');
    expect(feature.description).not.toContain('公式のイベント名から');
  });

  it('does not include cancelled or sales-only events in a seasonal feature', () => {
    const features = editorialFeatures([
      event('紅葉のライトアップ', { officialStatus: 'cancelled' }),
      event('秋の新作販売会', { category: 'shopping' }),
    ], new Date('2026-10-01T12:00:00+09:00'));

    expect(features).toEqual([]);
  });
});
