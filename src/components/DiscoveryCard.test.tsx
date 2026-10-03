import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeEvent } from './HomeDiscovery';
import { DiscoveryCard } from './DiscoveryCard';

const event = (extra: Partial<HomeEvent> = {}): HomeEvent => ({
  id: 'namba',
  eventName: 'なんばの灯り展',
  categoryLabel: '展覧会',
  venueName: 'なんば広場',
  timeLabel: '10月10日 18:00',
  recommendation: 70,
  ongoing: false,
  distanceKm: 3.4,
  ...extra,
});

describe('DiscoveryCard', () => {
  it('shows poster treatment, reservation, and important status without repeating category or home distance', () => {
    render(<DiscoveryCard event={event({
      statusLabel: '受付終了（最新状況は公式確認）',
      reservationRequired: true,
      imageUrl: 'https://example.test/event.jpg',
      imageSource: '主催者のポスター',
    })} scope="home-weekend" onSelect={vi.fn()} />);

    expect(screen.getByText('ポスター')).toBeInTheDocument();
    expect(screen.getByText('受付終了（最新状況は公式確認）')).toBeInTheDocument();
    expect(screen.getByText('要予約')).toBeInTheDocument();
    expect(screen.queryByText('展覧会')).not.toBeInTheDocument();
    expect(screen.queryByText(/直線 3\.4km/)).not.toBeInTheDocument();
    expect(document.querySelector('.discovery-card__media')).toHaveClass('is-poster');
  });

  it('keeps image-less events compact and decodes the displayed price', () => {
    const { container } = render(<DiscoveryCard event={event({
      imageUrl: undefined,
      description: 'この説明は一覧カードでは省略します。',
      priceLabel: '&yen;1,200',
    })} compact onSelect={vi.fn()} />);
    const card = container.querySelector('.discovery-card')!;

    expect(card).toHaveClass('is-no-image');
    expect(card.querySelector('.discovery-card__media')).toBeNull();
    expect(screen.getByText('¥1,200')).toBeInTheDocument();
    expect(screen.queryByText('この説明は一覧カードでは省略します。')).not.toBeInTheDocument();
  });

  it('shows distance only in a distance surface and preserves the save action', () => {
    const onSave = vi.fn();
    render(<DiscoveryCard event={event()} scope="map-distance" onSelect={vi.fn()} onSave={onSave} />);

    expect(screen.getByText(/直線 3\.4km/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'なんばの灯り展を保存' }));
    expect(onSave).toHaveBeenCalledWith('namba');
  });
});
