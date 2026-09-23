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
    fireEvent.click(screen.getByRole('button', { name: /注目イベント.*詳細/ }));
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

  it('keeps imagery quiet and falls back to the date panel when an image is missing or fails', () => {
    renderHome({ events: [{ ...event('market', '市場の催し', 'マルシェ'), imageUrl: 'https://www.pref.osaka.lg.jp/example.jpg' }, event('plain', '読書会', '読書')] });
    const market = screen.getAllByRole('button', { name: /市場の催し/ }).find((button) => button.classList.contains('home-event-card'))!;
    expect(market.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(market).queryByText('公式画像・出典')).not.toBeInTheDocument();
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
    expect(document.querySelector('.home-spotlight__story[aria-hidden="false"] img')).toHaveAttribute('src', 'https://example.test/shared.jpg');
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
    expect(document.querySelector('.home-spotlight__story[aria-hidden="false"] img')).not.toBeInTheDocument();
  });

  it('rotates the visual story every three seconds without a manual pause control', () => {
    vi.useFakeTimers();
    const events = Array.from({ length: 3 }, (_, index) => ({ ...event(String(index), `物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    expect(screen.getByRole('heading', { name: '物語0' })).toBeInTheDocument();
    expect(document.querySelector('.home-motion-toggle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自動送り/ })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('heading', { name: '物語1' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('heading', { name: '物語2' })).toBeInTheDocument();
  });

  it('does not auto-rotate when reduced motion is requested', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const events = Array.from({ length: 2 }, (_, index) => ({ ...event(String(index), `静かな物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    act(() => vi.advanceTimersByTime(13000));
    expect(screen.getByRole('heading', { name: '静かな物語0' })).toBeInTheDocument();
    expect(document.querySelector('.home-motion-toggle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自動送り/ })).not.toBeInTheDocument();
    expect(document.querySelector('.home-discovery')).toHaveAttribute('data-motion', 'reduced');
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
    const detail = screen.getByRole('button', { name: /注目イベント.*詳細/ });
    detail.focus();
    act(() => vi.advanceTimersByTime(3000));
    expect(document.activeElement).toBe(detail);
    expect(screen.getByRole('heading', { name: 'フォーカス物語0' })).toBeInTheDocument();
  });

  it('resumes auto-rotation after the temporary pause following a swipe', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', MouseEvent);
    const events = Array.from({ length: 3 }, (_, index) => ({ ...event(String(index), `再開物語${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    renderHome({ events, totalCount: events.length });
    const detail = screen.getByRole('button', { name: /注目イベント.*詳細/ });
    fireEvent.pointerDown(detail, { pointerType: 'touch', button: 0, clientX: 180, clientY: 100 });
    detail.focus();
    fireEvent.pointerUp(detail, { pointerType: 'touch', clientX: 80, clientY: 105 });
    expect(screen.getByRole('heading', { name: '再開物語1' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(9999));
    expect(screen.getByRole('heading', { name: '再開物語1' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: '再開物語2' })).toBeInTheDocument();
  });

  it('does not reset the spotlight timer when event objects refresh unchanged', () => {
    vi.useFakeTimers();
    const initial = Array.from({ length: 2 }, (_, index) => ({ ...event(String(index), `更新前${index}`), imageUrl: `https://example.test/${index}.jpg` }));
    const { rerender, props } = renderHome({ events: initial, totalCount: initial.length });
    act(() => vi.advanceTimersByTime(2999));
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
    expect(document.querySelector('.home-spotlight__story[aria-hidden="false"] img')).toHaveAttribute('src', 'https://example.test/2.jpg');
    expect(document.querySelector('.home-spotlight__story[aria-hidden="false"]')).toHaveClass('is-switching');
  });

  it('wraps with arrow controls and supports keyboard arrows', () => {
    const events = ['a', 'b', 'c'].map((id) => event(id, `矢印${id}`));
    renderHome({ events });
    fireEvent.click(screen.getByRole('button', { name: '前の注目イベント' }));
    expect(screen.getByRole('heading', { name: '矢印c' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /注目イベント.*詳細/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: '矢印a' })).toBeInTheDocument();
  });

  it('keeps auto rotation paused for ten seconds after a manual change', () => {
    vi.useFakeTimers();
    renderHome({ events: ['a', 'b', 'c'].map((id) => event(id, `待機${id}`)) });
    fireEvent.click(screen.getByRole('button', { name: '次の注目イベント' }));
    act(() => vi.advanceTimersByTime(9999));
    expect(screen.getByRole('heading', { name: '待機b' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.getByRole('heading', { name: '待機c' })).toBeInTheDocument();
  });

  it('does not switch for a vertical touch gesture and cancels detail after horizontal swipe', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const onSelectEvent = vi.fn();
    renderHome({ events: ['a', 'b'].map((id) => event(id, `タッチ${id}`)), onSelectEvent });
    const hero = screen.getByRole('button', { name: /注目イベント.*詳細/ });
    fireEvent.pointerDown(hero, { pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerUp(hero, { pointerType: 'touch', clientX: 105, clientY: 180 });
    expect(screen.getByRole('heading', { name: 'タッチa' })).toBeInTheDocument();
    fireEvent.pointerDown(hero, { pointerType: 'touch', button: 0, clientX: 180, clientY: 100 });
    fireEvent.pointerUp(hero, { pointerType: 'touch', clientX: 80, clientY: 105 });
    fireEvent.click(hero);
    expect(onSelectEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'タッチb' })).toBeInTheDocument();
  });

  it('uses only explicit today events and shows an empty state when absent', () => {
    renderHome({ events: [{ ...event('ongoing'), ongoing: true }], todayEvents: [] });
    expect(screen.getByRole('heading', { name: '今日のピックアップ' })).toBeInTheDocument();
    expect(screen.getByText(/本日開催の確定したおすすめはありません/)).toBeInTheDocument();
    cleanup();
    renderHome({ events: [], totalCount: 0, todayEvents: [event('today', '今日だけ')] });
    expect(screen.getByRole('button', { name: /今日だけ/ })).toBeInTheDocument();
  });

  it('keeps the active spotlight id when large events reorder', () => {
    const largeEvents = ['a', 'b'].map((id) => event(id, `並び${id}`));
    const { rerender, props } = renderHome({ events: largeEvents, largeEvents });
    fireEvent.click(screen.getByRole('button', { name: '次の注目イベント' }));
    rerender(<HomeDiscovery {...props} largeEvents={[largeEvents[1], largeEvents[0]]} />);
    expect(screen.getByRole('heading', { name: '並びb' })).toBeInTheDocument();
  });

  it('uses the supplied large-event recommendations instead of rebuilding the spotlight', () => {
    const all = [event('all', '一覧の先頭'), event('large', '大型おすすめ')];
    renderHome({ events: all, largeEvents: [all[1]] });
    expect(screen.getByRole('heading', { name: '大型おすすめ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '一覧の先頭' })).not.toBeInTheDocument();
  });

  it('follows a horizontal pointer drag and returns on a sub-threshold gesture', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const events = ['a', 'b'].map((id) => event(id, `ドラッグ${id}`));
    renderHome({ events });
    const hero = screen.getByRole('button', { name: /注目イベント.*詳細/ });
    fireEvent.pointerDown(hero, { pointerType: 'touch', button: 0, clientX: 180, clientY: 100 });
    fireEvent.pointerMove(hero, { pointerType: 'touch', clientX: 130, clientY: 104, pointerId: 1 });
    expect(document.querySelector('.home-spotlight__track')).toHaveStyle('--spotlight-drag: -50px');
    fireEvent.pointerUp(hero, { pointerType: 'touch', clientX: 155, clientY: 104 });
    expect(screen.getByRole('heading', { name: 'ドラッグa' })).toBeInTheDocument();
    expect(document.querySelector('.home-spotlight__track')).toHaveStyle('--spotlight-drag: 0px');
    expect(document.querySelector('.home-spotlight__track')).toHaveClass('is-track-animating');
  });

  it('opens the whole spotlight card with Enter and Space', () => {
    const onSelectEvent = vi.fn();
    renderHome({ onSelectEvent });
    const hero = screen.getByRole('button', { name: /注目イベント.*詳細/ });
    hero.focus();
    fireEvent.keyDown(hero, { key: 'Enter' });
    fireEvent.keyDown(hero, { key: ' ' });
    expect(onSelectEvent).toHaveBeenCalledTimes(2);
  });

  it('places today recommendations immediately after the hero and before facts', () => {
    renderHome({ todayEvents: [event('today', '今日だけ')] });
    const hero = document.querySelector('.home-hero')!;
    const today = document.querySelector('.editorial-ongoing')!;
    const facts = document.querySelector('.home-discovery__facts')!;
    expect(hero.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(today.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps spotlight and today picks out of the first default list cards', () => {
    const entries = Array.from({ length: 8 }, (_, index) => event(String(index), `催し${index}`));
    renderHome({ events: entries, largeEvents: [entries[0]], todayEvents: [entries[1]], totalCount: entries.length });
    const firstCards = [...document.querySelectorAll('.home-event-card > strong')].map((item) => item.textContent);
    expect(firstCards).toEqual(['催し2', '催し3', '催し4', '催し5', '催し6', '催し7']);
    expect(screen.getByRole('heading', { name: '今日のピックアップ' })).toBeInTheDocument();
  });
});
