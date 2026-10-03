import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryHeader } from './DiscoveryHeader';

describe('DiscoveryHeader', () => {
  it('keeps all primary destinations and location/profile actions reachable', () => {
    const onShowHome = vi.fn();
    const onShowMap = vi.fn();
    const onShowSaved = vi.fn();
    const onSearch = vi.fn();
    const onLocate = vi.fn();
    const onOpenProfile = vi.fn();
    render(<div className="app-surface"><DiscoveryHeader liveCount={4} originLabel="大阪駅から" view="home"
      onLocate={onLocate} onOpenProfile={onOpenProfile} onShowHome={onShowHome} onShowMap={onShowMap} onShowSaved={onShowSaved} onSearch={onSearch} savedCount={2} /></div>);

    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ホーム' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'イベントを検索' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '地図' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存したイベント（2件）' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '地図' }));
    fireEvent.click(screen.getByRole('button', { name: 'イベントを検索' }));
    fireEvent.click(screen.getByRole('button', { name: '保存したイベント（2件）' }));
    fireEvent.click(screen.getByRole('button', { name: '現在地を基準にする' }));
    fireEvent.click(screen.getByRole('button', { name: '好みを設定' }));
    expect(onShowMap).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onShowSaved).toHaveBeenCalledOnce();
    expect(onLocate).toHaveBeenCalledOnce();
    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
