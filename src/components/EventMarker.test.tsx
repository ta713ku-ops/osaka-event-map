import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-leaflet', async () => {
  const React = await import('react')
  const Marker = React.forwardRef<any, any>((props, ref) => {
    const elementRef = React.useRef<HTMLDivElement>(null)
    const activate = () => props.eventHandlers?.click?.()
    React.useImperativeHandle(ref, () => ({
      getElement: () => elementRef.current,
      fire: (event: string) => { if (event === 'click') activate() },
    }), [props.eventHandlers])

    const iconHtml = typeof props.icon?.options?.html === 'string' ? props.icon.options.html : ''
    return <div data-testid="marker-host">
      <div
        ref={elementRef}
        data-testid="leaflet-marker"
        role="button"
        tabIndex={0}
        aria-label={props.title}
        onClick={activate}
        dangerouslySetInnerHTML={{ __html: iconHtml }}
      />
    </div>
  })
  return { Marker, Tooltip: () => null }
})

import { EventMarker } from './EventMarker'

const event = { id: 'event-42', eventName: '天神祭', latitude: 34.69, longitude: 135.5, category: 'festival' }

describe('EventMarker keyboard behavior', () => {
  afterEach(cleanup)

  it('places the focus target on the Leaflet marker element with no nested tab stop', () => {
    render(<EventMarker event={event} />)
    const marker = screen.getByTestId('leaflet-marker')
    expect(marker).toHaveAttribute('data-event-focus', 'map-pin:event-42')
    expect(marker).toHaveAttribute('tabindex', '0')
    expect(marker).toHaveAttribute('aria-label', '天神祭')
    expect(marker.querySelectorAll('[tabindex]')).toHaveLength(0)
    expect(marker.querySelector('.event-marker__hit')).toHaveAttribute('aria-hidden', 'true')
  })

  it('activates once on Enter keydown and prevents Leaflet map propagation', () => {
    const onSelect = vi.fn()
    render(<EventMarker event={event} onSelect={onSelect} />)
    const marker = screen.getByTestId('leaflet-marker')
    const host = screen.getByTestId('marker-host')
    const bubbledKeyDown = vi.fn()
    host.addEventListener('keydown', bubbledKeyDown)

    const enter = createEvent.keyDown(marker, { key: 'Enter' })
    fireEvent(marker, enter)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(event)
    expect(enter.defaultPrevented).toBe(true)
    expect(bubbledKeyDown).not.toHaveBeenCalled()

    fireEvent.keyDown(marker, { key: 'Enter', repeat: true })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('activates once on Space keydown and prevents page scrolling', () => {
    const onSelect = vi.fn()
    render(<EventMarker event={event} onSelect={onSelect} />)
    const marker = screen.getByTestId('leaflet-marker')

    const space = createEvent.keyDown(marker, { key: ' ' })
    fireEvent(marker, space)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(event)
    expect(space.defaultPrevented).toBe(true)

    fireEvent.keyDown(marker, { key: ' ', repeat: true })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
