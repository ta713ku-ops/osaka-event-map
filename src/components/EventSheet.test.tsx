import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventSheet } from './EventSheet';

describe('EventSheet map preview', () => {
  afterEach(cleanup);

  it('keeps the map choice compact and opens the independent detail page', () => {
    const openDetail = vi.fn();
    render(<EventSheet event={{ id: 'event-a', eventName: '根拠のある展覧会', category: 'exhibition', venueName: '市立美術館', startDate: '2026-09-06' }} onClose={vi.fn()} onOpenDetail={openDetail} />);
    expect(screen.getByRole('dialog', { name: '地図のイベント概要' })).toBeInTheDocument();
    expect(screen.queryByText('行く前に知っておきたいこと')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /詳しく見る/ }));
    expect(openDetail).toHaveBeenCalledTimes(1);
  });

  it('disables route guidance when location facts are not verified', () => {
    render(<EventSheet event={{ eventName: '場所未確認', officialUrl: 'https://example.test/event' }} onClose={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: '経路案内なし' })).toBeDisabled();
    expect(screen.getByText(/住所・会場情報が未確認/)).toBeInTheDocument();
  });

  it('allows coordinate-only records to use route guidance', () => {
    const navigate = vi.fn();
    render(<EventSheet event={{ eventName: '座標のみの会場', latitude: 34.69, longitude: 135.5 }} onClose={vi.fn()} onNavigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: '経路を見る' }));
    expect(navigate).toHaveBeenCalledWith('apple');
  });
});
