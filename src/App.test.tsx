import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  sources: [
    { id: 'test-ok', name: 'テスト公式', url: 'https://example.test/ok', status: 'success' as const, count: 3, checkedAt: '2026-09-01T00:00:00+09:00' },
    { id: 'test-error', name: '取得できない公式', url: 'https://example.test/error', status: 'error' as const, count: 0, checkedAt: '2026-09-01T00:00:00+09:00', error: 'offline' },
  ],
  events: [
    { id: 'event-a', eventName: '中之島ナイトマーケット', category: 'market', venueName: '中之島公園', address: '大阪市北区', startDate: '2099-08-31', startTime: '18:00', endTime: '21:00', latitude: 34.69, longitude: 135.50, freeEvent: true, tags: ['free', 'family'] as const, description: '夜のマーケットです。' },
    { id: 'event-b', eventName: '大阪クラフト展', category: 'exhibition', venueName: '市立美術館', address: '大阪市天王寺区', startDate: '2099-09-01', startTime: '10:00', endTime: '17:00', latitude: 34.65, longitude: 135.51, freeEvent: false, tags: ['exhibition', 'limited'] as const },
    { id: 'event-unknown', eventName: '場所未確認の音楽会', category: 'music', startDate: '2099-09-02', startTime: '18:00', endTime: '21:00', latitude: null, longitude: null, tags: ['celebrity'] as const },
  ],
};

async function openFirstFeaturedEvent() {
  await screen.findAllByText('中之島ナイトマーケット');
  const card = document.querySelector<HTMLButtonElement>('.home-event-card');
  expect(card).not.toBeNull();
  fireEvent.click(card!);
}

describe('App editorial home integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => events }));
    const values = new Map<string, string>([['dokoiko-osaka-profile-v1', JSON.stringify({ companion: 'ひとり', transport: '電車' })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('mounts the editorial home first with primary discovery controls', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
    expect(screen.queryByTestId('event-map')).not.toBeInTheDocument();
    for (const label of ['今日', '今夜', '明日', '今週末']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await screen.findAllByText('中之島ナイトマーケット');
  });

  it('filters the home without leaving the editorial surface', async () => {
    render(<App />);
    const search = screen.getByPlaceholderText('イベント名や場所から探す');
    fireEvent.change(search, { target: { value: 'ナイト' } });
    await waitFor(() => expect(screen.queryAllByText('大阪クラフト展')).toHaveLength(0));
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
  });

  it('opens event details from the candidate rail and blocks the background', async () => {
    render(<App />);
    await openFirstFeaturedEvent();
    expect(screen.getByRole('dialog', { name: 'イベント詳細' })).toBeInTheDocument();
    expect(document.querySelector('.modal-scrim')).toBeInTheDocument();
  });

  it('retries a failed event load in place', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, json: async () => events });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('イベント情報を読み込めませんでした');
    fireEvent.click(screen.getByRole('button', { name: 'もう一度読み込む' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('opens Apple and Google map URLs from details', async () => {
    const open = vi.fn(); vi.stubGlobal('open', open); render(<App />);
    await openFirstFeaturedEvent();
    fireEvent.click(screen.getByRole('button', { name: /Apple Maps/ }));
    fireEvent.click(screen.getByRole('button', { name: /Google Maps/ }));
    expect(open).toHaveBeenNthCalledWith(1, expect.stringContaining('maps.apple.com'), '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenNthCalledWith(2, expect.stringContaining('google.com/maps'), '_blank', 'noopener,noreferrer');
  });

  it('closes event details with Escape', async () => {
    render(<App />);
    await openFirstFeaturedEvent();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'イベント詳細' })).not.toBeInTheDocument();
  });

  it('applies additional filters while keeping the home mounted', async () => {
    render(<App />); await screen.findAllByText('中之島ナイトマーケット');
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '無料' }));
    fireEvent.click(screen.getByRole('button', { name: 'この条件で探す' }));
    expect(screen.getByRole('button', { name: /条件を追加、1件適用中/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
  });

  it('filters by evidence-backed tags without duplicating the free option', async () => {
    render(<App />); await screen.findAllByText('中之島ナイトマーケット');
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '有名人来場' }));
    fireEvent.click(screen.getByRole('button', { name: 'この条件で探す' }));
    await waitFor(() => expect(screen.queryByText('中之島ナイトマーケット')).not.toBeInTheDocument());
    expect(screen.getAllByText('場所未確認の音楽会').length).toBeGreaterThan(0);
  });

  it('keeps an unknown-coordinate event in the list and detail without a broken route', async () => {
    render(<App />); await screen.findAllByText('場所未確認の音楽会');
    const card = [...document.querySelectorAll<HTMLButtonElement>('.home-event-card')].find((item) => item.textContent?.includes('場所未確認の音楽会'));
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(screen.getByRole('dialog', { name: 'イベント詳細' })).toBeInTheDocument();
    const routeButtons = screen.getAllByRole('button', { name: '経路案内を利用できません' });
    routeButtons.forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog', { name: 'イベント詳細' })).not.toBeInTheDocument();
  });

  it('opens an unknown-coordinate detail from the map-side list and keeps it open', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    const row = [...document.querySelectorAll<HTMLButtonElement>('.event-row')].find((item) => item.textContent?.includes('場所未確認の音楽会'));
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(screen.getByRole('dialog', { name: 'イベント詳細' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '経路案内を利用できません' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
  });

  it('shows source health in a compact disclosure', async () => {
    render(<App />); await screen.findAllByText('中之島ナイトマーケット');
    const summary = screen.getByText(/公式ソース 1\/2件を確認/);
    expect(summary.parentElement).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(screen.getByText(/一部情報の更新確認に失敗しています/)).toBeInTheDocument();
    expect(screen.getByText(/取得できない公式/)).toBeInTheDocument();
  });

  it('reaches map results beyond the initial 20 rows', async () => {
    const extra = Array.from({ length: 21 }, (_, index) => ({
      id: `event-extra-${index}`, eventName: `追加イベント${index + 1}`, category: 'market', venueName: `会場${index + 1}`,
      address: `大阪市北区${index + 1}`, startDate: '2099-09-03', latitude: 34.6 + index / 1000, longitude: 135.5,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...events, events: [...events.events, ...extra] }) }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    expect(document.querySelectorAll('.event-row')).toHaveLength(20);
    const more = screen.getByRole('button', { name: /もっと見る（残り 4件）/ });
    fireEvent.click(more);
    expect(document.querySelectorAll('.event-row')).toHaveLength(24);
  });

  it('moves from home to map and back', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ホーム' }));
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
  });
});
