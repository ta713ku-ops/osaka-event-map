import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeDiscovery, type HomeEvent } from './HomeDiscovery';

const event = (id: string, name = `イベント${id}`, categoryLabel = 'マルシェ'): HomeEvent => ({
  id, eventName: name, categoryLabel, venueName: '大阪公園', timeLabel: '9月1日 10:00',
  travelMinutes: 20, recommendation: 80, ongoing: false, description: '開催内容です。',
});

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeDiscovery>> = {}) {
  const props: React.ComponentProps<typeof HomeDiscovery> = {
    events: [event('a', '中之島ナイトマーケット')], totalCount: 1, liveCount: 0, query: '',
    onQueryChange: vi.fn(), timeFilter: 'all', timeFilters: [{ key: 'all', label: 'これから' }],
    onTimeFilterChange: vi.fn(), onShowMap: vi.fn(), onSelectEvent: vi.fn(), onOpenFilters: vi.fn(),
    activeFilterCount: 0, loading: false, error: '', onReset: vi.fn(), ...overrides,
  };
  return { ...render(<HomeDiscovery {...props} />), props };
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('HomeDiscovery', () => {
  it('reveals six cards at a time, then all cards', () => {
    const events = Array.from({ length: 13 }, (_, index) => event(String(index)));
    renderHome({ events, totalCount: events.length });
    const cards = () => document.querySelectorAll('.home-event-card');
    expect(cards()).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /もっと見る（残り 7件）/ }));
    expect(cards()).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: /もっと見る（残り 1件）/ }));
    expect(cards()).toHaveLength(13);
    expect(screen.queryByRole('button', { name: /もっと見る/ })).not.toBeInTheDocument();
  });

  it('opens the spotlight event detail', () => {
    const onSelectEvent = vi.fn();
    renderHome({ onSelectEvent });
    fireEvent.click(screen.getByRole('button', { name: /詳細を見る/ }));
    expect(onSelectEvent).toHaveBeenCalledWith('a');
  });

  it('shows loading, error with retry, and empty states', () => {
    renderHome({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('大阪のイベントを探しています');
    cleanup();
    renderHome({ error: 'イベント情報を読み込めませんでした。' });
    expect(screen.getByRole('alert')).toHaveTextContent('イベント情報を読み込めませんでした');
    expect(screen.getByRole('button', { name: 'もう一度読み込む' })).toBeInTheDocument();
    cleanup();
    renderHome({ events: [], totalCount: 0 });
    expect(screen.getByText('条件に合うイベントがありません')).toBeInTheDocument();
  });

  it('labels official images and falls back to the date panel when an image is missing or fails', () => {
    renderHome({ events: [{ ...event('market', '市場の催し', 'マルシェ'), imageUrl: 'https://www.pref.osaka.lg.jp/example.jpg' }, event('plain', '読書会', '読書')] });
    const market = screen.getAllByRole('button', { name: /市場の催し/ }).find((button) => button.classList.contains('home-event-card'))!;
    expect(market.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(market).getByText('会場の公式画像')).toBeInTheDocument();
    fireEvent.error(market.querySelector('img')!);
    expect(within(market).queryByRole('img')).not.toBeInTheDocument();
    expect(within(market).getAllByText('9月1日 10:00').length).toBeGreaterThan(0);
    const plain = screen.getAllByRole('button', { name: /読書会/ }).find((button) => button.classList.contains('home-event-card'))!;
    expect(within(plain).queryByRole('img')).not.toBeInTheDocument();
  });

  it('rotates the visual story and allows the user to pause it', () => {
    vi.useFakeTimers();
    const events = Array.from({ length: 3 }, (_, index) => ({ ...event(String(index), `物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    expect(screen.getByRole('heading', { name: '物語0' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6500));
    expect(screen.getByRole('heading', { name: '物語1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '動きを止める' }));
    act(() => vi.advanceTimersByTime(13000));
    expect(screen.getByRole('heading', { name: '物語1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '動かす' })).toBeInTheDocument();
  });

  it('does not auto-rotate when reduced motion is requested', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const events = Array.from({ length: 2 }, (_, index) => ({ ...event(String(index), `静かな物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    act(() => vi.advanceTimersByTime(13000));
    expect(screen.getByRole('heading', { name: '静かな物語0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '動きを減らしています' })).toBeDisabled();
  });
});
