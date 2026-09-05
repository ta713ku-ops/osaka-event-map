import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverageStatus, parseCoverageData } from './CoverageStatus';

describe('CoverageStatus', () => {
  it('parses the audit contract and hides resolved candidates', () => {
    const data = parseCoverageData({
      schemaVersion: 1,
      generatedAt: '2026-09-05T00:00:00.000Z',
      summary: { tracked: 2, healthy: 1, warning: 1, gap: 3 },
      sources: [{ id: 'one', name: '公式情報', status: 'healthy', eventCount: 4 }],
      categories: [{ id: 'amusement', label: 'テーマパーク', status: 'gap' }],
      candidates: [
        { id: 'pending', title: '確認待ちイベント', status: 'pending', officialCandidateUrl: 'https://example.jp/event' },
        { id: 'resolved', title: '掲載済みイベント', status: 'resolved' },
      ],
    });
    expect(data?.candidates).toHaveLength(1);
    expect(data?.candidates?.[0].officialUrl).toBe('https://example.jp/event');
    render(<CoverageStatus data={data} />);
    expect(screen.getByText('現在の収集状況')).toBeInTheDocument();
    expect(screen.queryByText('掲載済みイベント')).not.toBeInTheDocument();
  });

  it('keeps a coverage failure separate from the event feed', () => {
    render(<CoverageStatus error="failed" onRetry={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('イベント一覧は通常どおり');
    expect(screen.getByRole('button', { name: '再確認' })).toBeInTheDocument();
  });
});
