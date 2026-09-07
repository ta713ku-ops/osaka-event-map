import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventDetailPage } from './EventDetailPage';

const event = {
  id: 'event-a', eventName: '中之島の灯り', category: 'illumination', startDate: '2026-09-06', endDate: '2026-09-08',
  venueName: '中之島公園', address: '大阪市北区', officialUrl: 'https://example.test/event', description: '夜の水辺を楽しむイベントです。',
  price: '無料', reservationRequired: false, rainPolicy: '小雨決行', parking: false, nearestStation: '淀屋橋駅',
  source: '公式サイト', sourceUrl: 'https://example.test/source', lastCheckedAt: '2026-09-01T00:00:00+09:00',
} as const;

describe('EventDetailPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows decision facts without fabricating missing fields', () => {
    render(<EventDetailPage event={event} requestedId="event-a" loading={false} now={new Date('2026-09-06T12:00:00+09:00')} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: '中之島の灯り' })).toBeInTheDocument();
    expect(screen.getByText('開催期間中')).toBeInTheDocument();
    expect(screen.getByText('予約不要')).toBeInTheDocument();
    expect(screen.getByText('小雨決行')).toBeInTheDocument();
    expect(screen.getByText('駐車場なし')).toBeInTheDocument();
    expect(screen.queryByText('出典を開く')).not.toBeInTheDocument();
  });

  it('uses explicit official cancellation status over date calculation', () => {
    render(<EventDetailPage event={{ ...event, officialStatus: 'cancelled', statusEvidence: '主催者が中止を発表' }} requestedId="event-a" loading={false} now={new Date('2026-09-06T12:00:00+09:00')} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('中止')).toBeInTheDocument();
    expect(screen.getByText('主催者が中止を発表')).toBeInTheDocument();
  });

  it('keeps unavailable facts concise without repeating the source instruction', () => {
    render(<EventDetailPage event={{ ...event, price: undefined, freeEvent: undefined, reservationRequired: undefined, rainPolicy: undefined, rainSupport: undefined, parking: undefined }} requestedId="event-a" loading={false} now={new Date()} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getAllByText('未取得')).toHaveLength(4);
    expect(screen.queryByText(/公式情報で確認/)).not.toBeInTheDocument();
  });

  it('falls back to copying the canonical URL when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<EventDetailPage event={event} requestedId="event-a" loading={false} now={new Date()} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '共有' }));
    expect(await screen.findByText('URLをコピーしました')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/events\/event-a\/$/u));
  });

  it('asks which map app to use from the mobile route action', () => {
    const navigate = vi.fn();
    render(<EventDetailPage event={event} requestedId="event-a" loading={false} now={new Date()} onBack={vi.fn()} onRetry={vi.fn()} onNavigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: '経路を見る' }));
    expect(screen.getByRole('dialog', { name: '地図アプリを選ぶ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apple Maps' }));
    expect(navigate).toHaveBeenCalledWith('apple', event);
  });
});
