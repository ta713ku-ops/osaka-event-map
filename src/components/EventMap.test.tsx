import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mapHarness = vi.hoisted(() => {
  let state = { latitude: 34.6937, longitude: 135.5023, zoom: 11 }
  let map: any
  let handlers: Record<string, Set<() => void>>
  let container: HTMLElement | null = null

  const trigger = (name: string) => handlers[name]?.forEach((handler) => handler())
  const reset = (center: [number, number] = [34.6937, 135.5023], zoom = 11) => {
    state = { latitude: center[0], longitude: center[1], zoom }
    handlers = {}
    container = null
    map = {
      getCenter: () => ({ lat: state.latitude, lng: state.longitude }),
      getZoom: () => state.zoom,
      getContainer: () => container,
      on: vi.fn((name: string, handler: () => void) => {
        handlers[name] ??= new Set()
        handlers[name].add(handler)
      }),
      off: vi.fn((name: string, handler: () => void) => handlers[name]?.delete(handler)),
      setView: vi.fn((center: [number, number], zoom: number) => {
        state = { latitude: center[0], longitude: center[1], zoom }
        trigger('moveend')
        trigger('zoomend')
      }),
      invalidateSize: vi.fn(),
    }
  }

  const clear = () => {
    state = { latitude: 34.6937, longitude: 135.5023, zoom: 11 }
    map = null
    handlers = {}
    container = null
  }

  const ensure = (center: [number, number], zoom: number) => {
    if (!map) reset(center, zoom)
  }

  return {
    reset,
    clear,
    ensure,
    getMap: () => map,
    getState: () => ({ ...state }),
    setContainer: (node: HTMLElement | null) => { container = node },
    userView: (latitude: number, longitude: number, zoom: number) => {
      state = { latitude, longitude, zoom }
      trigger('moveend')
      trigger('zoomend')
    },
  }
})

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom, ...props }: any) => {
    mapHarness.ensure(center, zoom)
    return <div data-testid="map-container" ref={mapHarness.setContainer} {...props}>{children}</div>
  },
  TileLayer: () => null,
  useMap: () => mapHarness.getMap(),
}))

vi.mock('./EventMarker', () => ({
  EventMarker: ({ event, onSelect }: any) => <button type="button" data-testid="marker" onClick={() => onSelect?.(event)}>{event.eventName}</button>,
}))

import { EventMap, type MapViewport } from './EventMap'

describe('EventMap', () => {
  beforeEach(() => mapHarness.clear())
  afterEach(cleanup)

  it('renders only events with valid coordinates and selects the mapped event', () => {
    const onEventSelect = vi.fn()
    const mappable = { id: 'map-event', eventName: '地図に出る', latitude: 34.69, longitude: 135.5 }
    render(<EventMap events={[
      mappable,
      { id: 'missing', eventName: '場所未確認', latitude: null, longitude: null },
      { id: 'invalid', eventName: '無効な座標', latitude: 0, longitude: 0 },
    ]} onEventSelect={onEventSelect} />)

    expect(screen.getByTestId('marker')).toHaveTextContent('地図に出る')
    expect(screen.queryByText('場所未確認')).not.toBeInTheDocument()
    expect(screen.queryByText('無効な座標')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('marker'))
    expect(onEventSelect).toHaveBeenCalledTimes(1)
    expect(onEventSelect).toHaveBeenCalledWith(mappable)
  })

  it('does not turn a map background click into an event selection or selection clear', () => {
    const onEventSelect = vi.fn()
    render(<EventMap events={[{ id: 'map-event', eventName: '祭り', latitude: 34.69, longitude: 135.5 }]} onEventSelect={onEventSelect} />)

    fireEvent.click(screen.getByTestId('map-container'))
    expect(onEventSelect).not.toHaveBeenCalled()
  })

  it('restores a supplied viewport, applies changed viewport props, and reports user movement once', () => {
    const onViewportChange = vi.fn()
    const firstViewport: MapViewport = { latitude: 34.7, longitude: 135.4, zoom: 12 }
    const { rerender } = render(<EventMap events={[]} viewport={firstViewport} onViewportChange={onViewportChange} />)

    expect(mapHarness.getState()).toEqual(firstViewport)
    expect(onViewportChange).not.toHaveBeenCalled()

    const restoredViewport: MapViewport = { latitude: 34.8, longitude: 135.6, zoom: 13 }
    rerender(<EventMap events={[]} viewport={restoredViewport} onViewportChange={onViewportChange} />)
    expect(mapHarness.getState()).toEqual(restoredViewport)
    expect(mapHarness.getMap().setView).toHaveBeenCalledTimes(1)
    expect(onViewportChange).not.toHaveBeenCalled()

    act(() => mapHarness.userView(34.81, 135.61, 14))
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportChange).toHaveBeenCalledWith({ latitude: 34.81, longitude: 135.61, zoom: 14 })

    // The parent echoes the reported position back as a prop without causing a setView loop.
    rerender(<EventMap events={[]} viewport={{ latitude: 34.81, longitude: 135.61, zoom: 14 }} onViewportChange={onViewportChange} />)
    expect(mapHarness.getMap().setView).toHaveBeenCalledTimes(1)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
  })

  it('suppresses hidden map changes and invalidates its size on reactivation while preserving the saved viewport', () => {
    const onViewportChange = vi.fn()
    const savedViewport: MapViewport = { latitude: 34.72, longitude: 135.42, zoom: 12 }
    const { rerender } = render(<EventMap events={[]} viewport={savedViewport} onViewportChange={onViewportChange} active={false} />)
    mapHarness.getMap().invalidateSize.mockImplementation(() => {
      // Model Leaflet's stale hidden-size center jumping when it becomes visible.
      mapHarness.userView(34.5, 135.7, 12)
    })

    act(() => mapHarness.userView(35, 136, 15))
    expect(onViewportChange).not.toHaveBeenCalled()

    rerender(<EventMap events={[]} viewport={savedViewport} onViewportChange={onViewportChange} active />)
    expect(mapHarness.getState()).toEqual(savedViewport)
    expect(mapHarness.getMap().invalidateSize).toHaveBeenCalledWith({ pan: false, animate: false })
    expect(mapHarness.getMap().setView).toHaveBeenCalledTimes(1)
    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it('exposes a focusable, labelled map container', () => {
    render(<EventMap events={[]} />)
    const map = screen.getByRole('region', { name: '大阪のイベント地図' })
    expect(map).toHaveAttribute('tabindex', '0')
  })
})
