import type { EventFilters } from '../components/FilterSheet';
import type { Coordinates, TimeFilter } from '../types';
import { EVENT_TAGS } from '../types';
import { eventIdFromPath } from './eventRoutes';

export const NAVIGATION_KEY = 'dokoikoNavigation';
export type MapViewport = Coordinates & { zoom: number };
export type SurfaceState = {
  view: 'home' | 'map' | 'saved'; query: string; timeFilter: TimeFilter; filters: EventFilters;
  origin: Coordinates; originLabel: string; viewport: MapViewport;
  mapListLimit: number; railLimit: number; homeLimit: number;
};
export type PagePosition = { home: number; list: number; rail: number; detail: number; focus: string | null };
export type NavigationEntry = {
  version: 1; key: string; parentKey: string | null; detailId: string | null;
  surface: SurfaceState; position: PagePosition;
};
export const defaultSurface = (): SurfaceState => ({
  view: 'home', query: '', timeFilter: 'all', filters: {},
  origin: { latitude: 34.7025, longitude: 135.4959 }, originLabel: '大阪駅から',
  viewport: { latitude: 34.6937, longitude: 135.5023, zoom: 11 },
  mapListLimit: 20, railLimit: 12, homeLimit: 6,
});
export const emptyPosition = (): PagePosition => ({ home: 0, list: 0, rail: 0, detail: 0, focus: null });
export function newEntry(detailId: string | null, surface = defaultSurface(), parentKey: string | null = null): NavigationEntry {
  return { version: 1, key: crypto.randomUUID(), parentKey, detailId, surface, position: emptyPosition() };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown) => nonnegative(value) && Number.isInteger(value) && value > 0 && value <= 100000;
const coordinates = (value: unknown): boolean => record(value)
  && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
  && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
const timeFilters = ['all', 'today', 'tonight', 'tomorrow', 'upcoming', 'weekend'];
function validFilters(value: unknown): boolean {
  if (!record(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (item === undefined) return true;
    if (['free', 'rainOk', 'family', 'date', 'night'].includes(key)) return typeof item === 'boolean';
    if (key === 'selectedDate') return typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item) && Number.isFinite(Date.parse(`${item}T00:00:00Z`)) && new Date(`${item}T00:00:00Z`).toISOString().slice(0, 10) === item;
    if (key === 'area') return typeof item === 'string' && ['osaka-kita', 'osaka-minami', 'osaka-tennoji', 'osaka-bay', 'osaka-other', 'hokusetsu', 'kawachi', 'sakai'].includes(item);
    if (key === 'sort') return item === 'attention' || item === 'date';
    if (key === 'feature') return item === 'season';
    if (key === 'withinMinutes') return item === 30 || item === 60;
    if (key === 'time') return typeof item === 'string' && ['today', 'tomorrow', 'tonight', 'weekend'].includes(item);
    if (key === 'categories') return Array.isArray(item) && item.every(v => typeof v === 'string');
    if (key === 'tags') return Array.isArray(item) && item.every(v => EVENT_TAGS.includes(v));
    return false;
  });
}
export function readEntry(state: unknown, pathname: string): NavigationEntry | null {
  if (!record(state)) return null;
  const entry = state[NAVIGATION_KEY];
  if (!record(entry) || entry.version !== 1 || typeof entry.key !== 'string' || !entry.key
    || !(entry.parentKey === null || (typeof entry.parentKey === 'string' && entry.parentKey && entry.parentKey !== entry.key))
    || entry.detailId !== eventIdFromPath(pathname)) return null;
  const s = entry.surface, p = entry.position;
  if (!record(s) || !['home', 'map', 'saved'].includes(String(s.view)) || typeof s.query !== 'string'
    || !timeFilters.includes(String(s.timeFilter)) || !validFilters(s.filters)
    || !coordinates(s.origin) || typeof s.originLabel !== 'string' || !coordinates(s.viewport)
    || !record(s.viewport) || typeof s.viewport.zoom !== 'number' || s.viewport.zoom < 9 || s.viewport.zoom > 17
    || !Number.isFinite(s.viewport.zoom) || !count(s.mapListLimit) || !count(s.railLimit) || !count(s.homeLimit)
    || !record(p) || !['home', 'list', 'rail', 'detail'].every(key => nonnegative(p[key]))
    || !(p.focus === null || typeof p.focus === 'string')) return null;
  return entry as NavigationEntry;
}
export function entryState(entry: NavigationEntry, existing: unknown) {
  return { ...(record(existing) ? existing : {}), [NAVIGATION_KEY]: entry };
}
