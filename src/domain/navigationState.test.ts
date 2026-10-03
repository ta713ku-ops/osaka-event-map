import { describe, expect, it } from 'vitest';
import { defaultSurface, entryState, NAVIGATION_KEY, newEntry, readEntry } from './navigationState';

describe('navigation state', () => {
  it('round trips exploration and detail history without losing other state owners', () => {
    const surface = { ...defaultSurface(), view: 'map' as const, query: '大阪', mapListLimit: 40, browseAll: true };
    const home = newEntry(null, surface);
    const detail = newEntry('public-route', surface, home.key);
    const state = entryState(detail, { anotherApp: 12 });
    expect(state).toHaveProperty('anotherApp', 12);
    expect(readEntry(state, '/events/public-route/')).toEqual(detail);
    expect(readEntry(entryState(home, null), '/')).toEqual(home);
  });
  it.each([
    { surface: { ...defaultSurface(), browseAll: 'yes' } },
    { version: 2 }, { key: '' }, { parentKey: 5 }, { detailId: 'different' },
    { surface: { ...defaultSurface(), viewport: { latitude: NaN, longitude: 135, zoom: 12 } } },
    { surface: { ...defaultSurface(), viewport: { latitude: 34, longitude: 135, zoom: Infinity } } },
    { surface: { ...defaultSurface(), filters: { tags: ['made-up'] } } },
    { surface: { ...defaultSurface(), filters: { categories: 'market' } } },
    { surface: { ...defaultSurface(), mapListLimit: -2 } },
    { position: { home: 0, list: 0, rail: 0, detail: -1, focus: null } },
  ])('rejects corrupt or incompatible history: %j', (patch) => {
    expect(readEntry({ [NAVIGATION_KEY]: { ...newEntry('a'), ...patch } }, '/events/a/')).toBeNull();
  });
  it('treats missing state and mismatched URL as direct access', () => {
    expect(readEntry(null, '/events/a/')).toBeNull();
    expect(readEntry(entryState(newEntry('a'), {}), '/events/b/')).toBeNull();
  });
});
