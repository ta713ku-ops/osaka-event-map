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
const coverage = {
  schemaVersion: 1,
  generatedAt: '2026-09-01T00:00:00+09:00',
  summary: { tracked: 1, healthy: 1, warning: 0, gap: 1 },
  sources: [{ id: 'coverage-source', name: '収集範囲テスト', status: 'healthy', eventCount: 3 }],
  categories: [], venues: [], candidates: [], limitations: [],
};

const responseFor = (url: unknown, eventData: unknown = events) => ({ ok: true, json: async () => String(url).includes('coverage.json') ? coverage : eventData });

async function openFirstFeaturedEvent() {
  await screen.findAllByText('中之島ナイトマーケット');
  const card = [...document.querySelectorAll<HTMLButtonElement>('.home-event-card')]
    .find((item) => item.textContent?.includes('中之島ナイトマーケット'));
  expect(card).not.toBeNull();
  fireEvent.click(card!);
}

describe('App editorial home integration', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => responseFor(url)));
    const values = new Map<string, string>([['dokoiko-osaka-profile-v1', JSON.stringify({ companion: 'ひとり', transport: '電車' })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('mounts the editorial home first with primary discovery controls', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
    expect(screen.queryByTestId('event-map')).not.toBeInTheDocument();
    for (const label of ['今日', '今夜', '明日', '近日開催', '今週末']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await screen.findAllByText('中之島ナイトマーケット');
    expect(screen.getByRole('heading', { name: 'イベント一覧' })).toBeInTheDocument();
    expect(screen.getByText(/件・注目順/)).toBeInTheDocument();
  });

  it('filters the home without leaving the editorial surface', async () => {
    render(<App />);
    const search = screen.getByPlaceholderText('イベント名や場所から探す');
    fireEvent.change(search, { target: { value: 'ナイト' } });
    await waitFor(() => expect(screen.queryAllByText('大阪クラフト展')).toHaveLength(0));
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
  });

  it('opens a shareable event detail page from the candidate rail', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<App />);
    await openFirstFeaturedEvent();
    expect(screen.getByRole('heading', { level: 1, name: '中之島ナイトマーケット' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/events/event-a/');
    expect(document.querySelector('.app-surface')).toHaveAttribute('hidden');
    expect(replaceState).toHaveBeenCalledWith(expect.objectContaining({ dokoikoDetail: true }), '', '/events/event-a/');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('closes details without leaving the detail URL in browser history', async () => {
    const back = vi.spyOn(window.history, 'back');
    render(<App />);
    await openFirstFeaturedEvent();
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(window.location.pathname).toBe('/');
    expect(back).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { level: 1, name: '中之島ナイトマーケット' })).not.toBeInTheDocument();
  });

  it('retries a failed event load in place', async () => {
    let eventAttempts = 0;
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('coverage.json')) return responseFor(url);
      eventAttempts += 1;
      if (eventAttempts === 1) throw new Error('offline');
      return responseFor(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('イベント情報を読み込めませんでした');
    fireEvent.click(screen.getByRole('button', { name: 'もう一度読み込む' }));
    await waitFor(() => expect(eventAttempts).toBe(2));
  });

  it('opens Apple and Google map URLs from details', async () => {
    const open = vi.fn(); vi.stubGlobal('open', open); render(<App />);
    await openFirstFeaturedEvent();
    fireEvent.click(screen.getByRole('button', { name: '経路を見る（Apple Maps）' }));
    fireEvent.click(screen.getByRole('button', { name: /Google Maps/ }));
    expect(open).toHaveBeenNthCalledWith(1, expect.stringContaining('maps.apple.com'), '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenNthCalledWith(2, expect.stringContaining('google.com/maps'), '_blank', 'noopener,noreferrer');
  });

  it('returns from event details and restores the discovery surface', async () => {
    render(<App />);
    await openFirstFeaturedEvent();
    window.history.replaceState({}, '', '/');
    fireEvent.popState(window);
    expect(screen.queryByRole('heading', { level: 1, name: '中之島ナイトマーケット' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 1, name: '場所未確認の音楽会' })).toBeInTheDocument();
    const routeButtons = screen.getAllByRole('button', { name: /経路を見る/ });
    routeButtons.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText(/住所・会場情報が未確認のため/)).toBeInTheDocument();
  });

  it('opens a compact preview from the map-side list before full details', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    const row = [...document.querySelectorAll<HTMLButtonElement>('.event-row')].find((item) => item.textContent?.includes('場所未確認の音楽会'));
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(screen.getByRole('dialog', { name: '地図のイベント概要' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '経路案内なし' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /詳しく見る/ }));
    expect(screen.getByRole('heading', { level: 1, name: '場所未確認の音楽会' })).toBeInTheDocument();
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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => responseFor(url, { ...events, events: [...events.events, ...extra] })));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    expect(document.querySelectorAll('.event-row')).toHaveLength(20);
    const more = screen.getByRole('button', { name: /もっと見る（残り 4件）/ });
    fireEvent.click(more);
    expect(document.querySelectorAll('.event-row')).toHaveLength(24);
  });

  it('keeps time filters, search, discovery axes and map navigation usable', async () => {
    const base = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(base);
    const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(base.getTime() + 86400000));
    const fixture = { ...events, events: [
      { ...events.events[0], startDate: today, endTime: '23:59' },
      { ...events.events[1], startDate: tomorrow },
    ] };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async url => responseFor(url, fixture)));
    render(<App />);
    await screen.findAllByText('中之島ナイトマーケット');
    fireEvent.click(screen.getByRole('button', { name: '今日' }));
    expect(document.querySelector('.home-featured-grid')).not.toHaveTextContent('大阪クラフト展');
    fireEvent.click(screen.getByRole('button', { name: '明日' }));
    expect(document.querySelector('.home-featured-grid')).not.toHaveTextContent('中之島ナイトマーケット');
    expect(document.querySelector('.home-featured-grid')).toHaveTextContent('大阪クラフト展');
    fireEvent.click(screen.getByRole('button', { name: '今夜' }));
    expect(document.querySelector('.home-featured-grid')).not.toHaveTextContent('大阪クラフト展');
    fireEvent.click(screen.getByRole('button', { name: '今週末' }));
    expect(screen.getByRole('button', { name: '今週末' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'これから' }));
    fireEvent.click(screen.getByRole('button', { name: /好きなことから探す/ }));
    expect(screen.getByRole('button', { name: 'この条件で探す' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'この条件で探す' }));
    fireEvent.click(screen.getByRole('button', { name: /場所から探す/ }));
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
  });

  it('moves from home to map and back', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /地図で近さを見る/ }));
    expect(screen.getByTestId('event-map')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ホーム' }));
    expect(screen.getByRole('heading', { name: /よりみち日和/ })).toBeInTheDocument();
  });
});
