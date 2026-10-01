import { Compass, LocateFixed, UserRound, Map, House, Bookmark } from 'lucide-react';
import './discovery-header.css';

type Props = {
  liveCount: number;
  originLabel: string;
  onLocate: () => void;
  onOpenProfile: () => void;
  view?: 'home' | 'map' | 'saved';
  onShowHome?: () => void;
  onShowMap?: () => void;
  onShowSaved?: () => void;
  savedCount?: number;
};

/** A compact, warm discovery header. Layout is intentionally delegated to the app stylesheet. */
export function DiscoveryHeader({ liveCount, originLabel, onLocate, onOpenProfile, view = 'map', onShowHome, onShowMap, onShowSaved, savedCount = 0 }: Props) {
  return (
    <header className="discovery-header" aria-label="どこいこ大阪">
      <div className="discovery-header__brand">
        <span className="discovery-header__mark" aria-hidden="true"><Compass size={19} /></span>
        <div>
          <p className="discovery-header__name">どこいこ大阪</p>
          <p className="discovery-header__copy">いつもの街で、まだ知らない体験を。</p>
        </div>
      </div>
      <nav className="discovery-header__nav" aria-label="メインナビゲーション">
        <button type="button" aria-label="ホーム" className={view === 'home' ? 'is-active' : ''} onClick={onShowHome} aria-current={view === 'home' ? 'page' : undefined}>
          <House size={16} aria-hidden="true" /><span>ホーム</span>
        </button>
        <button type="button" aria-label="地図" className={view === 'map' ? 'is-active' : ''} onClick={onShowMap} aria-current={view === 'map' ? 'page' : undefined}>
          <Map size={16} aria-hidden="true" /><span>地図</span>
        </button>
        <button type="button" aria-label={`保存したイベント（${savedCount}件）`} className={view === 'saved' ? 'is-active' : ''} onClick={onShowSaved} aria-current={view === 'saved' ? 'page' : undefined}><Bookmark size={16} aria-hidden="true" /><span>保存</span></button>
      </nav>
      <div className="discovery-header__status" aria-live="polite">
        <span className="discovery-header__live-dot" aria-hidden="true" />
        <span>{originLabel}・会期内 {liveCount}件</span>
      </div>
      <div className="discovery-header__actions">
        <button type="button" className="discovery-header__action" onClick={onLocate} aria-label="現在地を基準にする">
          <LocateFixed size={19} aria-hidden="true" />
        </button>
        <button type="button" className="discovery-header__profile" onClick={onOpenProfile} aria-label="あなた向け">
          <UserRound size={18} aria-hidden="true" /><span>あなた向け</span>
        </button>
      </div>
    </header>
  );
}
