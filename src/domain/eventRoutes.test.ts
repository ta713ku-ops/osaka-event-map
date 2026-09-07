import { describe, expect, it } from 'vitest';
import { appHomePath, eventIdFromPath, eventPath } from './eventRoutes';

describe('event detail routes', () => {
  it('builds paths below the configured Pages base', () => {
    expect(eventPath('event-a', '/osaka-event-map/')).toBe('/osaka-event-map/events/event-a/');
    expect(appHomePath('/osaka-event-map')).toBe('/osaka-event-map/');
  });

  it('reads only safe event ids from the matching base', () => {
    expect(eventIdFromPath('/osaka-event-map/events/event-a/', '/osaka-event-map/')).toBe('event-a');
    expect(eventIdFromPath('/events/event_a/', '/')).toBe('event_a');
    expect(eventIdFromPath('/other/events/event-a/', '/osaka-event-map/')).toBeNull();
    expect(eventIdFromPath('/events/%2Fetc/', '/')).toBeNull();
  });
});
