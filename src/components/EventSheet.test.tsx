import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventSheet, type EventSheetEvent } from './EventSheet';

describe('EventSheet provenance and destinations', () => {
  afterEach(cleanup);

  it('keeps evidence and source status compact until the disclosure is opened', () => {
    const event: EventSheetEvent = {
      eventName: '根拠のある展覧会', category: 'exhibition', venueName: '市立美術館', address: '大阪市天王寺区',
      tags: ['exhibition', 'limited'], tagEvidence: { exhibition: '公式ページの会期欄', limited: '公式ページに期間限定と記載' },
      sourceId: 'source-a', provenance: [{ sourceId: 'source-a', source: '公式サイト', sourceUrl: 'https://example.test/source', lastCheckedAt: '2026-09-01T00:00:00+09:00' }],
      sourceReports: [
        { id: 'source-a', name: '公式サイト', url: 'https://example.test/source', status: 'stale', count: 1, checkedAt: '2026-08-01T00:00:00+09:00' },
        { id: 'source-b', name: '別の公式サイト', url: 'https://example.test/other', status: 'error', count: 0, checkedAt: '2026-09-01T00:00:00+09:00' },
      ],
    };
    render(<EventSheet event={event} onClose={vi.fn()} />);
    expect(screen.queryByText('有名人来場')).not.toBeInTheDocument();
    expect(screen.getAllByText('展覧会')).toHaveLength(3);
    expect(screen.getAllByText('期間限定')).toHaveLength(2);
    const details = screen.getByText('出典・更新情報');
    expect(details.parentElement).not.toHaveAttribute('open');
    fireEvent.click(details);
    expect(screen.getByText(/公式ソースは取得失敗または更新確認が古い可能性/)).toBeInTheDocument();
    expect(screen.getByText(/公式ページの会期欄/)).toBeInTheDocument();
  });

  it('disables route actions when neither address nor coordinates are verified', () => {
    render(<EventSheet event={{ eventName: '場所未確認', officialUrl: 'https://example.test/event' }} onClose={vi.fn()} />);
    const actions = screen.getAllByRole('button', { name: '経路案内を利用できません' });
    expect(actions).toHaveLength(2);
    actions.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText(/公式サイトで場所をご確認ください/)).toBeInTheDocument();
  });

  it('allows coordinate-only records to use the route actions', () => {
    render(<EventSheet event={{ eventName: '座標のみの会場', latitude: 34.69, longitude: 135.5 }} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Apple Maps/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Google Maps/ })).toBeEnabled();
  });

  it('does not show an unrelated source warning for this event', () => {
    render(<EventSheet event={{
      eventName: '確認済みの催し', sourceId: 'source-a', source: '公式サイト',
      sourceReports: [
        { id: 'source-a', name: '公式サイト', url: 'https://example.test/source', status: 'success', count: 1, checkedAt: '2026-09-01T00:00:00+09:00' },
        { id: 'source-b', name: '別の公式サイト', url: 'https://example.test/other', status: 'error', count: 0, checkedAt: '2026-09-01T00:00:00+09:00', error: 'offline' },
      ],
    }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('出典・更新情報'));
    expect(screen.queryByText(/公式ソースは取得失敗または更新確認が古い可能性/)).not.toBeInTheDocument();
    expect(screen.queryByText(/別の公式サイト/)).not.toBeInTheDocument();
    expect(screen.getByText(/取得済み/)).toBeInTheDocument();
  });
});
