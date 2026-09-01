import { Compass, LocateFixed, UserRound } from 'lucide-react';

type Props = {
  liveCount: number;
  originLabel: string;
  onLocate: () => void;
  onOpenProfile: () => void;
};

/** A compact, warm discovery header. Layout is intentionally delegated to the app stylesheet. */
export function DiscoveryHeader({ liveCount, originLabel, onLocate, onOpenProfile }: Props) {
  return (
    <header className="discovery-header" aria-label="どこいこ大阪">
      <div className="discovery-header__brand">
        <span className="discovery-header__mark" aria-hidden="true"><Compass size={19} /></span>
        <div>
          <p className="discovery-header__name">どこいこ大阪</p>
          <p className="discovery-header__copy">いつもの街で、まだ知らない体験を。</p>
        </div>
      </div>
      <div className="discovery-header__status" aria-live="polite">
        <span className="discovery-header__live-dot" aria-hidden="true" />
        <span>{originLabel}・開催期間中 {liveCount}件</span>
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
