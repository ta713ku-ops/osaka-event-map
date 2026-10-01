import { describe, expect, it } from 'vitest';
import { parseBookmarks, toggleBookmark } from './bookmarks';
import type { EventItem } from '../types';
const event: EventItem = { id: 'mutable-id', routeId: 'stable', eventName: '祭り', category: 'festival', startDate: '2026-10-01' };
describe('saved events', () => {
  it('keeps a minimal stable snapshot and toggles by public ID', () => {
    const saved = toggleBookmark([], event);
    expect(parseBookmarks(JSON.stringify(saved))[0]).toMatchObject({ routeId: 'stable', eventName: '祭り' });
    expect(toggleBookmark(saved, { ...event, id: 'changed' })).toEqual([]);
  });
  it('rejects corrupt records and deduplicates restored items', () => {
    const saved = toggleBookmark([], event);
    expect(parseBookmarks(JSON.stringify([null, {}, ...saved, ...saved]))).toHaveLength(1);
    expect(() => parseBookmarks('{bad')).toThrow();
    expect(() => parseBookmarks('{}')).toThrow();
  });
});
