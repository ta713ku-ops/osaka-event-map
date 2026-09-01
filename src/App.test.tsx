import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./components/EventMap', () => ({
  EventMap: ({ events }: { events: Array<{ id: string; eventName: string }> }) => (
    <div data-testid="event-map">{events.map((event) => <span key={event.id}>{event.eventName}</span>)}</div>
  ),
}));

const events = {
  generatedAt: '2026-09-01T00:00:00+09:00',
  attribution: { name: 'test', license: 'CC BY', sourceUrl: 'https://example.test' },
  events: [
    { id: 'event-a', eventName: '中之島ナイトマーケット', category: 'market', venueName: '中之島公園', address: '大阪市北区', startDate: '2099-08-31', startTime: '18:00', endTime: '21:00', latitude: 34.69, longitude: 135.50, freeEvent: true, description: '夜のマーケットです。' },
    { id: 'event-b', eventName: '大阪クラフト展', category: 'exhibition', venueName: '市立美術館', address: '大阪市天王寺区', startDate: '2099-09-01', startTime: '10:00', endTime: '17:00', latitude: 34.65, longitude: 135.51, freeEvent: false },
  ],
};

describe('App map-first integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => events }));
    const values = new Map<string, string>([['dokoiko-osaka-profile-v1', JSON.stringify({ companion: 'ひとり', transport: '電車' })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('mounts the Osaka map on first render with primary time filters', async () => {
    render(<App />);
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
    for (const label of ['今日', '今夜', '明日', '今週末']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await screen.findAllByText('中之島ナイトマーケット');
  });

  it('filters the map without leaving the primary surface', async () => {
    render(<App />);
    const search = screen.getByPlaceholderText('イベント名や場所から探す');
    fireEvent.change(search, { target: { value: 'ナイト' } });
    await waitFor(() => expect(screen.queryAllByText('大阪クラフト展')).toHaveLength(0));
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
  });

  it('opens event details from the candidate rail and blocks the background', async () => {
    render(<App />);
    const rail = await screen.findByRole('region', { name: 'おすすめ候補' });
    fireEvent.click(within(rail).getByRole('button', { name: /中之島ナイトマーケット/ }));
    expect(screen.getByRole('dialog', { name: 'イベント詳細' })).toBeInTheDocument();
    expect(document.querySelector('.modal-scrim')).toBeInTheDocument();
  });

  it('retries a failed event load in place', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, json: async () => events });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('イベント情報を読み込めませんでした');
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('opens Apple and Google map URLs from details', async () => {
    const open = vi.fn(); vi.stubGlobal('open', open); render(<App />);
    const rail = await screen.findByRole('region', { name: 'おすすめ候補' });
    fireEvent.click(within(rail).getByRole('button', { name: /中之島ナイトマーケット/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apple Maps/ }));
    fireEvent.click(screen.getByRole('button', { name: /Google Maps/ }));
    expect(open).toHaveBeenNthCalledWith(1, expect.stringContaining('maps.apple.com'), '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenNthCalledWith(2, expect.stringContaining('google.com/maps'), '_blank', 'noopener,noreferrer');
  });

  it('closes event details with Escape', async () => {
    render(<App />); const rail = await screen.findByRole('region', { name: 'おすすめ候補' });
    fireEvent.click(within(rail).getByRole('button', { name: /中之島ナイトマーケット/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'イベント詳細' })).not.toBeInTheDocument();
  });

  it('applies additional filters while keeping the map mounted', async () => {
    render(<App />); await screen.findAllByText('中之島ナイトマーケット');
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '無料' }));
    fireEvent.click(screen.getByRole('button', { name: 'この条件で探す' }));
    expect(screen.getByRole('button', { name: /条件を追加、1件適用中/ })).toBeInTheDocument();
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
  });
});
