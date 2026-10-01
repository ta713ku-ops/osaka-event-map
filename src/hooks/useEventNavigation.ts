import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { appHomePath, eventIdFromPath, eventPath } from '../domain/eventRoutes';
import { defaultSurface, entryState, newEntry, readEntry, type NavigationEntry, type SurfaceState } from '../domain/navigationState';

function capture(entry: NavigationEntry): NavigationEntry {
  const position = { ...entry.position };
  const read = (selector: string) => document.querySelector<HTMLElement>(selector);
  if (entry.detailId) position.detail = read('.event-detail-page')?.scrollTop ?? position.detail;
  else if (entry.surface.view !== 'map') position.home = read('.app-shell.is-home')?.scrollTop ?? position.home;
  else {
    position.list = read('.results-panel')?.scrollTop ?? position.list;
    position.rail = read('.rail-cards')?.scrollLeft ?? position.rail;
  }
  return { ...entry, position };
}
function visible(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden') return false;
  }
  return true;
}
function restore(entry: NavigationEntry) {
  const setScroll = (selector: string, value: number, horizontal = false) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) { if (horizontal) node.scrollLeft = value; else node.scrollTop = value; }
  };
  if (entry.detailId) setScroll('.event-detail-page', entry.position.detail);
  else if (entry.surface.view !== 'map') setScroll('.app-shell.is-home', entry.position.home);
  else {
    setScroll('.results-panel', entry.position.list);
    setScroll('.rail-cards', entry.position.rail, true);
  }
  const target = [...document.querySelectorAll<HTMLElement>('[data-event-focus]')]
    .find(node => node.dataset.eventFocus === entry.position.focus && visible(node));
  const query = (selector: string) => document.querySelector<HTMLElement>(selector);
  const fallback = entry.detailId ? query('.event-detail-page h1') ?? query('.event-detail-page')
    : entry.surface.view === 'map' ? query('.leaflet-container') ?? query('.map-panel') : query('#home-results');
  (target ?? fallback)?.focus({ preventScroll: true });
}

// popstate arrives after the old entry becomes inactive. Keep its final scroll
// position across a reload even if a trailing scroll save has not fired yet.
const positionKey = (entry: NavigationEntry) => `dokoiko-position:${entry.key}`;
function cachePosition(entry: NavigationEntry) {
  try { sessionStorage.setItem(positionKey(entry), JSON.stringify(entry.position)); } catch { /* Storage may be unavailable. */ }
}
function clearPosition(entry: NavigationEntry) {
  try { sessionStorage.removeItem(positionKey(entry)); } catch { /* History remains usable. */ }
}
function readCurrentEntry() {
  const stored = readEntry(window.history.state, window.location.pathname);
  if (!stored) return null;
  try {
    const cached = sessionStorage.getItem(positionKey(stored));
    if (cached) return readEntry(entryState({ ...stored, position: JSON.parse(cached) }, {}), window.location.pathname) ?? stored;
  } catch { /* Invalid/unavailable cache falls back to the validated history. */ }
  return stored;
}

/** The URL is authoritative; history state only restores this tab's presentation. */
export function useEventNavigation(ready: boolean) {
  const [entry, setEntry] = useState(() => readCurrentEntry()
    ?? newEntry(eventIdFromPath(window.location.pathname)));
  const current = useRef(entry);
  const pending = useRef(true);
  const snapshots = useRef(new Map<string, NavigationEntry>());
  const saveTimer = useRef<number | undefined>(undefined);
  const cancelSave = useCallback(() => { window.clearTimeout(saveTimer.current); saveTimer.current = undefined; }, []);
  const save = useCallback(() => {
    cancelSave();
    if (pending.current) return;
    const next = capture(current.current);
    current.current = next;
    snapshots.current.set(next.key, next);
    // popstate has already changed the active entry: never write the old page over it.
    if (readEntry(window.history.state, window.location.pathname)?.key === next.key) {
      window.history.replaceState(entryState(next, window.history.state), '');
      clearPosition(next);
    }
  }, [cancelSave]);
  const transition = useCallback((next: NavigationEntry) => {
    cancelSave(); pending.current = true; current.current = next; setEntry(next);
  }, [cancelSave]);

  useLayoutEffect(() => {
    if (!readEntry(window.history.state, window.location.pathname)) {
      window.history.replaceState(entryState(current.current, window.history.state), '');
    }
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const pop = () => {
      if (!pending.current) {
        const previous = capture(current.current);
        snapshots.current.set(previous.key, previous);
        cachePosition(previous);
      }
      const stored = readCurrentEntry();
      const next = (stored && snapshots.current.get(stored.key)) ?? stored ?? newEntry(eventIdFromPath(window.location.pathname));
      window.history.replaceState(entryState(next, window.history.state), '');
      clearPosition(next);
      transition(next);
    };
    const scroll = () => {
      if (pending.current || saveTimer.current !== undefined) return;
      saveTimer.current = window.setTimeout(save, 120);
    };
    const visibility = () => { if (document.hidden) save(); };
    window.addEventListener('popstate', pop);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('scroll', scroll, true);
    return () => {
      cancelSave();
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('popstate', pop);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [cancelSave, save, transition]);

  useEffect(() => {
    if (!ready || !pending.current) return;
    const frame = window.requestAnimationFrame(() => {
      restore(current.current);
      pending.current = false;
      save();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entry.key, ready, save]);

  const updateSurface = useCallback(<K extends keyof SurfaceState>(key: K, value: SurfaceState[K] | ((old: SurfaceState[K]) => SurfaceState[K])) => {
    const old = current.current;
    const nextValue = typeof value === 'function' ? (value as (old: SurfaceState[K]) => SurfaceState[K])(old.surface[key]) : value;
    const next = { ...old, surface: { ...old.surface, [key]: nextValue } };
    current.current = next;
    setEntry(next);
    if (!pending.current) save();
  }, [save]);
  const open = useCallback((publicId: string, focus?: string) => {
    if (current.current.detailId === publicId) return;
    cancelSave();
    let previous = capture(current.current);
    previous = { ...previous, position: { ...previous.position, focus: focus ?? null } };
    snapshots.current.set(previous.key, previous);
    window.history.replaceState(entryState(previous, window.history.state), '');
    clearPosition(previous);
    const next = newEntry(publicId, previous.surface, previous.key);
    window.history.pushState(entryState(next, window.history.state), '', eventPath(publicId));
    transition(next);
  }, [cancelSave, transition]);
  const back = useCallback(() => {
    save();
    if (current.current.parentKey) window.history.back();
    else {
      const next = newEntry(null, defaultSurface());
      window.history.replaceState(entryState(next, window.history.state), '', appHomePath());
      transition(next);
    }
  }, [save, transition]);
  return { surface: entry.surface, detailId: entry.detailId, entryKey: entry.key, updateSurface, open, back };
}
