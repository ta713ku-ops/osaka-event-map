import type { EventItem } from '../types';

export const BOOKMARKS_KEY = 'dokoiko-bookmarks-v1';
export type Bookmark = Pick<EventItem, 'eventName' | 'startDate' | 'endDate' | 'venueName'> & { routeId: string; savedAt: string };
export function parseBookmarks(raw: string | null): Bookmark[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('保存データを読み取れません');
  const seen = new Set<string>();
  return value.filter((item): item is Bookmark => {
    if (!item || typeof item !== 'object' || typeof item.routeId !== 'string' || !/^[\w-]+$/.test(item.routeId)
      || typeof item.eventName !== 'string' || typeof item.startDate !== 'string' || typeof item.savedAt !== 'string'
      || (item.endDate !== undefined && typeof item.endDate !== 'string')
      || (item.venueName !== undefined && typeof item.venueName !== 'string') || seen.has(item.routeId)) return false;
    seen.add(item.routeId); return true;
  });
}
export function toggleBookmark(saved: Bookmark[], event: EventItem, now = new Date()): Bookmark[] {
  const routeId = event.routeId ?? event.id;
  if (saved.some(item => item.routeId === routeId)) return saved.filter(item => item.routeId !== routeId);
  return [{ routeId, eventName: event.eventName, startDate: event.startDate, endDate: event.endDate, venueName: event.venueName, savedAt: now.toISOString() }, ...saved];
}
