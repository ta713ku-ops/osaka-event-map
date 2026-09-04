import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: () => undefined,
}));
vi.mock('./EventMarker', () => ({
  EventMarker: ({ event }: { event: { eventName: string } }) => <span data-testid="marker">{event.eventName}</span>,
}));

import { EventMap } from './EventMap';

describe('EventMap coordinate handling', () => {
  afterEach(cleanup);

  it('does not clear a selected list item merely because its marker is unavailable', () => {
    const onEventSelect = vi.fn();
    render(<EventMap events={[{ id: 'unknown', eventName: '場所未確認', latitude: null, longitude: null }]} selectedEventId="unknown" onEventSelect={onEventSelect} />);
    expect(onEventSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
  });

  it('keeps valid events mappable while filtering invalid coordinate records', () => {
    render(<EventMap events={[{ id: 'valid', eventName: '地図に出る', latitude: 34.69, longitude: 135.5 }, { id: 'invalid', eventName: '地図に出ない', latitude: 0, longitude: 0 }]} />);
    expect(screen.getByTestId('marker')).toHaveTextContent('地図に出る');
    expect(screen.queryByText('地図に出ない')).not.toBeInTheDocument();
  });
});
