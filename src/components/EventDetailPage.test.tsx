import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { EventDetailPage, type DetailEvent } from './EventDetailPage';

const event = {
  id: 'event-a', eventName: '中之島の灯り', category: 'illumination', startDate: '2026-09-06', endDate: '2026-09-08',
  venueName: '中之島公園', address: '大阪市北区', officialUrl: 'https://example.test/event', description: '夜の水辺を楽しむイベントです。',
  price: '無料', reservationRequired: false, rainPolicy: '小雨決行', parking: false, nearestStation: '淀屋橋駅',
  sourceStatus: 'success', source: '公式サイト', sourceUrl: 'https://example.test/source', lastCheckedAt: '2026-09-06T10:00:00+09:00',
} as const;
const now = new Date('2026-09-06T12:00:00+09:00');
type PageProps = ComponentProps<typeof EventDetailPage>;
const renderPage = (overrides: Partial<DetailEvent> = {}, props: Partial<PageProps> = {}) => render(
  <EventDetailPage event={{ ...event, ...overrides }} requestedId="event-a" loading={false} now={now} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={vi.fn()} {...props} />,
);

describe('EventDetailPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('places decision facts before the long description and related events last', () => {
    renderPage({}, {
      nearbyOngoingEvents: [{ ...event, id: 'nearby', eventName: '近くの催し' }],
      sameAreaEvents: [{ ...event, id: 'same-area', eventName: '同じ地域の催し' }],
    });
    expect(screen.getByRole('heading', { level: 1, name: '中之島の灯り' })).toBeInTheDocument();
    expect(screen.getByText('開催期間中')).toBeInTheDocument();
    const basics = screen.getByRole('heading', { name: '参加の基本情報' });
    const description = screen.getByRole('heading', { name: 'イベントについて' });
    const access = screen.getByRole('heading', { name: 'アクセス' });
    const source = screen.getByRole('heading', { name: '出典と確認日' });
    const related = screen.getByRole('heading', { name: '近くのイベント' });
    expect(basics.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description.compareDocumentPosition(access) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(access.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(source.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('無料')).toBeInTheDocument();
    expect(screen.getByText('予約不要')).toBeInTheDocument();
    expect(screen.getByText('淀屋橋駅')).toBeInTheDocument();
    expect(screen.getByText('小雨決行')).toBeInTheDocument();
    expect(screen.getByText(/最終確認/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '公式サイトを開く' })).toHaveAttribute('href', 'https://example.test/event');
    expect(screen.getByRole('button', { name: 'Apple Mapsで経路を見る' })).toBeInTheDocument();
  });

  it('shows a numeric zero price as free and explicit closed dates', () => {
    renderPage({ price: 0, freeEvent: true, schedule: { closedDates: ['2026-09-07'] } });
    expect(screen.getByText('無料')).toBeInTheDocument();
    const basics = screen.getByRole('heading', { name: '参加の基本情報' }).closest('section');
    expect(within(basics!).getByText(/休催日/)).toBeInTheDocument();
    expect(within(basics!).getByText(/9月7日/)).toBeInTheDocument();
  });
  it('keeps all discount conditions available without burying the basic price', () => {
    const price = '一般 2,000円 *メンバーシップ無料。' + '詳細な割引条件を証明書で確認してください。'.repeat(12);
    renderPage({ price });
    expect(screen.getByText('一般 2,000円')).toBeInTheDocument();
    const disclosure = screen.getByText('詳しい料金・割引条件').closest('details');
    expect(disclosure).not.toHaveAttribute('open');
    expect(disclosure).toHaveTextContent(price);
  });
  it('keeps details usable when the official image fails', () => {
    renderPage({ imageUrl: 'https://example.test/photo.jpg' });
    const image = screen.getByRole('img', { name: '中之島の灯りの公式画像' });
    fireEvent.error(image);
    expect(screen.queryByRole('img', { name: '中之島の灯りの公式画像' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '参加の基本情報' })).toBeInTheDocument();
    expect(document.querySelector('.event-detail-media__fallback')).not.toBeNull();
  });

  it('shows reservation guidance, a secure booking link, contact, and a straight-line distance', () => {
    renderPage({
      reservationRequired: true,
      reservationInfo: '事前申込が必要です。',
      reservationUrl: 'https://tickets.example.test/book',
      distanceKm: 2.3,
      contact: { name: '主催事務局', phone: '06-1234-5678', email: 'info@example.test' },
    }, { saved: false, onToggleSave: vi.fn() });
    const reservation = screen.getByRole('link', { name: /公式予約へ/ });
    expect(reservation).toHaveAttribute('href', 'https://tickets.example.test/book');
    expect(reservation).toHaveAttribute('target', '_blank');
    expect(reservation).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('事前申込が必要です。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '問い合わせ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '06-1234-5678' })).toHaveAttribute('href', 'tel:0612345678');
    expect(screen.getByRole('link', { name: 'info@example.test' })).toHaveAttribute('href', 'mailto:info@example.test');
    expect(screen.getAllByText(/直線距離 約2\.3km/u)).toHaveLength(2);
    const save = screen.getByRole('button', { name: 'お気に入りに保存' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(save);
    expect(screen.getByRole('button', { name: 'お気に入りに保存' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not imply that reservation is available after it closes', () => {
    renderPage({
      officialStatus: 'registration_closed',
      reservationRequired: true,
      reservationUrl: 'https://tickets.example.test/book',
    });
    expect(screen.getByRole('button', { name: '受付終了' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /公式予約へ|予約先を公式ページで確認/ })).not.toBeInTheDocument();
  });

  it('does not render unsafe external URLs as links', () => {
    renderPage({
      officialUrl: 'javascript:alert(1)',
      sourceUrl: 'data:text/html,unsafe',
      reservationUrl: 'javascript:alert(1)',
    });
    expect(screen.queryByRole('link', { name: /公式サイトを開く/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /公式予約へ|予約先を公式ページで確認/ })).not.toBeInTheDocument();
  });

  it('uses explicit official cancellation status over date calculation', () => {
    renderPage({ officialStatus: 'cancelled', statusEvidence: '主催者が中止を発表', reservationUrl: 'https://tickets.example.test/book' });
    expect(document.querySelector('.event-status')).toHaveTextContent('中止');
    expect(screen.getByText('主催者が中止を発表')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開催中止' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /公式予約へ/ })).not.toBeInTheDocument();
  });

  it('marks old confirmation dates and unavailable details for official follow-up', () => {
    renderPage({ lastCheckedAt: '2026-09-01T00:00:00+09:00' });
    expect(screen.getByText('最新状況は公式情報でご確認ください')).toBeInTheDocument();
    expect(screen.getByText('掲載日程・最新状況は公式確認')).toBeInTheDocument();
    expect(screen.getByText('開催時間は未確認')).toBeInTheDocument();
  });

  it('connects related event links and keeps their sections empty when there are no candidates', () => {
    const openEvent = vi.fn();
    renderPage({}, { onOpenEvent: openEvent, nearbyOngoingEvents: [{ ...event, id: 'nearby', routeId: 'nearby-route', eventName: '近くの催し' }] });
    expect(screen.getByRole('heading', { name: '近くのイベント' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '同じ会場・エリアのイベント' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /近くの催し/ }));
    expect(openEvent).toHaveBeenCalledWith('nearby', 'related:event-nearby-title:nearby');
  });

  it('offers a recoverable empty and load-error state', () => {
    const onBack = vi.fn();
    const { rerender } = render(<EventDetailPage event={null} requestedId="gone" loading={false} now={now} onBack={onBack} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'イベントが見つかりません' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'イベントを探す' }));
    expect(onBack).toHaveBeenCalledOnce();
    rerender(<EventDetailPage event={null} requestedId="gone" loading={false} loadError="通信に失敗しました" now={now} onBack={onBack} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('通信に失敗しました');
    expect(screen.getByRole('button', { name: 'もう一度読み込む' })).toBeInTheDocument();
  });

  it('falls back to copying the canonical URL when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '共有' }));
    expect(await screen.findByText('URLをコピーしました')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/events\/event-a\//u));
  });

  it('asks which map app to use from the mobile route action', () => {
    const navigate = vi.fn();
    renderPage({}, { onNavigate: navigate });
    fireEvent.click(screen.getByRole('button', { name: '経路を見る', hidden: true }));
    expect(screen.getByRole('dialog', { name: '地図アプリを選ぶ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apple Maps' }));
    expect(navigate).toHaveBeenCalledWith('apple', expect.objectContaining({ id: 'event-a' }));
  });
});
