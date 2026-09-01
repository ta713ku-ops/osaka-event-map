import { ArrowRight, MapPinned, Pause, Play, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import * as React from 'react';
import './home-editorial.css';

export type HomeEvent = {
  id: string;
  eventName: string;
  categoryLabel: string;
  venueName?: string;
  timeLabel: string;
  travelMinutes: number;
  recommendation: number;
  ongoing: boolean;
  description?: string;
  imageUrl?: string;
  imageSourceUrl?: string;
};

type Props = {
  events: HomeEvent[];
  totalCount: number;
  liveCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  timeFilter: string;
  timeFilters: Array<{ key: string; label: string; accent?: boolean }>;
  onTimeFilterChange: (key: string) => void;
  onShowMap: () => void;
  onSelectEvent: (id: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  loading: boolean;
  error: string;
  onReset: () => void;
};

function EventMedia({ event, labelElement = 'span' }: { event: HomeEvent; labelElement?: 'span' | 'em' }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [event.imageUrl]);
  if (!event.imageUrl || failed) return <div className="home-date-art"><span>{event.timeLabel}</span><strong>{event.categoryLabel}</strong></div>;
  return <><img src={event.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />{React.createElement(labelElement, null, '会場の公式画像')}</>;
}

export function HomeDiscovery({
  events, totalCount, liveCount, query, onQueryChange, timeFilter, timeFilters,
  onTimeFilterChange, onShowMap, onSelectEvent, onOpenFilters, activeFilterCount,
  loading, error, onReset,
}: Props) {
  const [visibleCount, setVisibleCount] = React.useState(12);
  const [spotlightIndex, setSpotlightIndex] = React.useState(0);
  const [motionPaused, setMotionPaused] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const featured = events.slice(0, visibleCount);
  const spotlights = React.useMemo(() => (featured.filter((event) => event.imageUrl).slice(0, 4).length ? featured.filter((event) => event.imageUrl).slice(0, 4) : featured.slice(0, 4)), [featured]);
  React.useEffect(() => { if (!window.matchMedia) return; const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReducedMotion(media.matches); update(); media.addEventListener?.('change', update); return () => media.removeEventListener?.('change', update); }, []);
  React.useEffect(() => setSpotlightIndex((index) => spotlights.length ? index % spotlights.length : 0), [spotlights.length]);
  React.useEffect(() => { if (motionPaused || reducedMotion || spotlights.length < 2 || loading || error || document.hidden) return; const timer = window.setInterval(() => { if (!document.hidden) setSpotlightIndex((index) => (index + 1) % spotlights.length); }, 6500); return () => window.clearInterval(timer); }, [motionPaused, reducedMotion, spotlights.length, loading, error]);
  const spotlight = !loading && !error ? spotlights[spotlightIndex] : undefined;
  const motionStopped = motionPaused || reducedMotion;
  return (
    <section className="home-discovery" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">大阪のイベント案内</p>
          <h1 id="home-title">今日の大阪、<br /><strong>よりみち日和。</strong></h1>
          <p>今から行きやすい場所を、会期・距離・気分から見つけます。</p>
          <button type="button" className="home-map-cta" onClick={onShowMap}>
            <MapPinned size={19} aria-hidden="true" />地図で近さを見る<ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        {spotlight && <article className="home-spotlight">
          <div className="home-spotlight__story" key={spotlight.id}>
            <div className="home-spotlight__media"><EventMedia event={spotlight} /></div>
            <div className="home-spotlight__copy"><p>今のあなたに近い一件</p><h2>{spotlight.eventName}</h2><span>{spotlight.venueName ?? '大阪府内'} ・ {spotlight.ongoing ? '開催期間中' : spotlight.timeLabel}</span><small>{spotlight.description ?? '詳しい開催内容は公式サイトでご確認ください。'}</small><button type="button" aria-label="このイベントを見る（詳細を見る）" onClick={() => onSelectEvent(spotlight.id)}>このイベントを見る <ArrowRight size={15} aria-hidden="true" /></button></div>
          </div>
          <div className="home-spotlight__controls">{spotlights.length > 1 && <div className="home-spotlight__dots" aria-label="おすすめイベントを選択">{spotlights.map((item, index) => <button key={item.id} type="button" aria-label={`おすすめ${index + 1}件目を表示`} aria-current={index === spotlightIndex} onClick={() => setSpotlightIndex(index)} />)}</div>}<button type="button" className="home-motion-toggle" aria-pressed={motionStopped} disabled={reducedMotion} onClick={() => setMotionPaused((paused) => !paused)}>{motionStopped ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{reducedMotion ? '動きを減らしています' : motionPaused ? '動かす' : '動きを止める'}</button></div>
        </article>}
      </div>

      <div className="home-discovery__body" id="home-results" tabIndex={-1}>
        <div className="home-discovery__facts" aria-label="イベント概要">
          <span><strong>{totalCount}</strong> 件の候補</span>
          <span><i aria-hidden="true" />開催期間中 <strong>{liveCount}</strong> 件</span>
          <span>大阪の今日を案内</span>
        </div>

        <div className="home-search-row">
          <label className="home-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">イベント名や場所を検索</span>
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="イベント名や場所から探す" />
          </label>
          <button type="button" className="home-filter-button" onClick={onOpenFilters} aria-label={`条件を追加${activeFilterCount ? `、${activeFilterCount}件適用中` : ''}`}>
            <SlidersHorizontal size={18} aria-hidden="true" /><span>条件</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </button>
        </div>

        <div className="home-time-filters" aria-label="開催日の絞り込み">
          {timeFilters.map((filter) => (
            <button key={filter.key} type="button" className={`home-time-chip ${timeFilter === filter.key ? 'is-active' : ''} ${filter.accent ? 'is-accent' : ''}`} aria-pressed={timeFilter === filter.key} onClick={() => onTimeFilterChange(filter.key)}>
              {filter.accent && <Sparkles size={14} aria-hidden="true" />}{filter.label}
            </button>
          ))}
        </div>

        {loading && <div className="home-state-card" role="status"><span className="loading-dot" />大阪のイベントを探しています…</div>}
        {error && <div className="home-state-card is-error" role="alert"><strong>{error}</strong><button type="button" onClick={onReset}>もう一度読み込む</button></div>}
        {!loading && !error && events.length === 0 && <div className="home-state-card"><strong>条件に合うイベントがありません</strong><span>検索語や時間、条件を少し広げてみてください。</span><button type="button" onClick={onReset}>すべての候補を見る</button></div>}

        {!loading && !error && featured.length > 0 && <>
          <div className="home-section-heading"><div><p>今から出会う、大阪</p><h2>今から選べる場所</h2></div><span>{events.length}件の候補</span></div>
          <div className="home-featured-grid">
            {featured.map((event) => <button key={event.id} type="button" className="home-event-card" onClick={() => onSelectEvent(event.id)}>
              <span className="home-event-card__media"><EventMedia event={event} labelElement="em" /></span>
              <span className={`home-event-card__status ${event.ongoing ? 'is-live' : ''}`}>{event.ongoing ? '開催期間中' : event.timeLabel}</span>
              <span className="home-event-card__category">{event.categoryLabel}</span>
              <strong>{event.eventName}</strong>
              {event.venueName && <small>{event.venueName}</small>}
              {event.description && <span className="home-event-card__description">{event.description}</span>}
              <span className="home-event-card__meta">約{event.travelMinutes}分 ・ {event.timeLabel}</span>
            </button>)}
          </div>
          {visibleCount < events.length && <button type="button" className="home-more-button" onClick={() => setVisibleCount((count) => count + 12)}>もっと見る（残り {events.length - visibleCount}件）</button>}
          <button type="button" className="home-secondary-map-cta" onClick={onShowMap}><MapPinned size={17} aria-hidden="true" />候補を地図で比べる<ArrowRight size={16} aria-hidden="true" /></button>
        </>}
        <p className="data-note">大阪府オープンデータ（CC BY 4.0）を利用。「開催期間中」は会期の表示です。実施日・予約・料金は公式サイトをご確認ください。「会場の公式画像」は提供データの画像で、イベント当日の記録写真とは限りません。</p>
      </div>
    </section>
  );
}
