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

  it('reaches every home result beyond the former forty-item cap', () => {
    const events = Array.from({ length: 41 }, (_, index) => event(String(index), `全件イベント${index + 1}`));
    renderHome({ events, totalCount: events.length });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const more = screen.queryByRole('button', { name: /もっと見る/ });
      if (!more) break;
      fireEvent.click(more);
    }
    expect(document.querySelectorAll('.home-event-card')).toHaveLength(41);
    expect(screen.getByRole('button', { name: /全件イベント41/ })).toBeInTheDocument();
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
    expect(within(market).getByText('公式画像・出典')).toBeInTheDocument();
    fireEvent.error(market.querySelector('img')!);
    expect(within(market).queryByRole('img')).not.toBeInTheDocument();
    expect(within(market).getAllByText('9月1日 10:00').length).toBeGreaterThan(0);
    const plain = screen.getAllByRole('button', { name: /読書会/ }).find((button) => button.classList.contains('home-event-card'))!;
    expect(within(plain).queryByRole('img')).not.toBeInTheDocument();
  });

  it('selects spotlight imagery across the full result set without repeating an image', () => {
    const events = [
      { ...event('one', '一つ目'), venueName: '会場A', imageUrl: 'https://example.test/shared.jpg' },
      { ...event('two', '二つ目'), venueName: '会場A', imageUrl: 'https://example.test/shared.jpg' },
      { ...event('three', '三つ目'), venueName: '会場B', imageUrl: 'https://example.test/two.jpg' },
      { ...event('four', '四つ目'), venueName: '会場C', imageUrl: 'https://example.test/three.jpg' },
      { ...event('five', '五つ目'), venueName: '会場D', imageUrl: 'https://example.test/four.jpg' },
      { ...event('six', '六つ目'), venueName: '会場E', imageUrl: 'https://example.test/five.jpg' },
    ];
    renderHome({ events, totalCount: events.length });
    expect(screen.getByRole('button', { name: 'おすすめ4件目を表示' })).toBeInTheDocument();
    expect(document.querySelector('.home-spotlight__media img')).toHaveAttribute('src', 'https://example.test/shared.jpg');
  });

  it('fills remaining spotlight slots with image-less events after unique images', () => {
    const events = [
      { ...event('one', '画像付き1'), imageUrl: 'https://example.test/photo.jpg?width=640' },
      { ...event('two', '同じ写真', '展覧会'), imageUrl: 'https://example.test/photo.jpg?width=1280' },
      event('three', '画像なし1'),
      event('four', '画像なし2'),
      event('five', '画像なし3'),
    ];
    renderHome({ events, totalCount: events.length });
    expect(screen.getByRole('button', { name: 'おすすめ4件目を表示' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ2件目を表示' }));
    expect(screen.getByRole('heading', { name: '画像なし1' })).toBeInTheDocument();
    expect(document.querySelector('.home-spotlight__media img')).not.toBeInTheDocument();
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

  it('uses a clear fallback when travel time is unavailable and does not mislabel future events as ongoing', () => {
    const future = event('future', 'これからの催し');
    renderHome({ events: [{ ...future, travelMinutes: undefined, ongoing: false }], totalCount: 1, liveCount: 0 });
    const card = document.querySelector<HTMLElement>('.home-event-card')!;
    expect(within(card).getByText(/場所を確認/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '開催中のイベント' })).not.toBeInTheDocument();
    expect(screen.getByText(/公式公開データ/)).toBeInTheDocument();
  });

  it('keeps the first-open entry off subsequent search/filter renders', () => {
    const initialEvents = [
      { ...event('one', '最初の物語'), imageUrl: 'https://example.test/one.jpg' },
      { ...event('two', '次の物語'), imageUrl: 'https://example.test/two.jpg' },
    ];
    const { rerender, props } = renderHome({ events: initialEvents, totalCount: initialEvents.length });
    const hero = document.querySelector('.home-spotlight');
    expect(hero).toBeInTheDocument();
    rerender(<HomeDiscovery {...props} events={[initialEvents[1], initialEvents[0]]} query="物語" />);
    const story = document.querySelector('.home-spotlight__story')!;
    expect(story).not.toHaveClass('is-switching');
    expect(document.querySelector('.home-spotlight')).toBe(hero);
  });

  it('keeps keyboard focus in the spotlight when auto-rotation is due', () => {
    vi.useFakeTimers();
    const events = Array.from({ length: 2 }, (_, index) => ({ ...event(String(index), `フォーカス物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    const detail = screen.getByRole('button', { name: /詳細を見る/ });
    detail.focus();
    act(() => vi.advanceTimersByTime(6500));
    expect(document.activeElement).toBe(detail);
    expect(screen.getByRole('heading', { name: 'フォーカス物語0' })).toBeInTheDocument();
  });

  it('does not reset the spotlight timer when event objects refresh unchanged', () => {
    vi.useFakeTimers();
    const initial = Array.from({ length: 2 }, (_, index) => ({ ...event(String(index), `更新前${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    const { rerender, props } = renderHome({ events: initial, totalCount: initial.length });
    act(() => vi.advanceTimersByTime(6499));
    const refreshed = initial.map((item) => ({ ...item, description: '更新後の説明' }));
    rerender(<HomeDiscovery {...props} events={refreshed} />);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: '更新前1' })).toBeInTheDocument();
  });

  it('changes the linked image and copy together on manual spotlight selection', () => {
    const events = Array.from({ length: 3 }, (_, index) => ({ ...event(String(index), `手動物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ3件目を表示' }));
    expect(screen.getByRole('heading', { name: '手動物語2' })).toBeInTheDocument();
    expect(document.querySelector('.home-spotlight__media img')).toHaveAttribute('src', 'https://example.test/2.jpg');
    expect(document.querySelector('.home-spotlight__story')).toHaveClass('is-switching');
  });
});
