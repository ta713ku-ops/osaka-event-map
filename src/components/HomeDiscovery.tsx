import { ArrowLeft, ArrowRight, MapPinned, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import * as React from 'react';
import './home-editorial.css';
import './website.css';
import { DiscoveryCard } from './DiscoveryCard';

export type HomeEvent = {
  id: string;
  routeId?: string;
  distanceKm?: number;
  priceLabel?: string;
  statusLabel?: string;
  saved?: boolean;
  eventName: string;
  categoryLabel: string;
  venueName?: string;
  timeLabel: string;
  travelMinutes?: number | null;
  recommendation: number;
  ongoing: boolean;
  description?: string;
  imageUrl?: string;
};

const AUTO_ADVANCE_MS = 3000;
const STORY_SWITCH_MS = 640;
const MANUAL_PAUSE_MS = 10000;
const SWIPE_THRESHOLD_PX = 45;

type Props = {
  originLabel?: string;
  events: HomeEvent[];
  onToggleSave?: (id: string) => void;
  searchControls?: React.ReactNode;
  weekendEvents?: HomeEvent[];
  features?: { id: string; title: string; description: string; events: HomeEvent[] }[];
  onFeatureSelect?: (id: string) => void;
  featureTitle?: string;
  featureDescription?: string;
  sortLabel?: string;
  largeEvents?: HomeEvent[];
  todayEvents?: HomeEvent[];
  totalCount: number;
  liveCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  timeFilter: string;
  timeFilters: Array<{ key: string; label: string; accent?: boolean }>;
  onTimeFilterChange: (key: string) => void;
  onShowMap: () => void;
  onSelectEvent: (id: string, focus?: string) => void;
  visibleLimit?: number;
  onVisibleLimitChange?: (value: number) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  loading: boolean;
  error: string;
  sourceStatus?: React.ReactNode;
  onReset: () => void;
};

function EventMedia({ event, priority = false }: { event: HomeEvent; priority?: boolean }) {
  const [imageState, setImageState] = React.useState({ url: '', failed: false, thumbnail: false });
  const failed = imageState.url === event.imageUrl && imageState.failed;
  const thumbnail = imageState.url === event.imageUrl && imageState.thumbnail;
  if (!event.imageUrl || failed) return <div className="home-date-art"><span>{event.timeLabel}</span><strong>{event.categoryLabel}</strong></div>;
  return <>
    {thumbnail && <img className="is-thumbnail-backdrop" src={event.imageUrl} alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer" />}
    <img className={thumbnail ? 'is-thumbnail' : undefined} src={event.imageUrl} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} width="1200" height="800" referrerPolicy="no-referrer" onLoad={e => setImageState({ url: event.imageUrl ?? '', failed: false, thumbnail: e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth < 480 })} onError={() => setImageState({ url: event.imageUrl ?? '', failed: true, thumbnail: false })} />
  </>;
}

export function HomeDiscovery({
  events, largeEvents, todayEvents = [], totalCount, query, onQueryChange, timeFilter, timeFilters, originLabel = '大阪駅から',
  onTimeFilterChange, onShowMap, onSelectEvent, onOpenFilters, activeFilterCount,
  loading, error, sourceStatus, onReset, visibleLimit, onVisibleLimitChange, onToggleSave, searchControls, weekendEvents = [], features = [], onFeatureSelect, featureTitle, featureDescription, sortLabel = '注目順',
}: Props) {
  const [localVisibleCount, setLocalVisibleCount] = React.useState(6);
  const visibleCount = visibleLimit ?? localVisibleCount;
  const setVisibleCount = (update: (count: number) => number) => {
    const value = update(visibleCount);
    if (onVisibleLimitChange) onVisibleLimitChange(value); else setLocalVisibleCount(value);
  };
  const [spotlightIndex, setSpotlightIndex] = React.useState(0);
  const [trackPosition, setTrackPosition] = React.useState(1);
  const [trackTransitioning, setTrackTransitioning] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [documentHidden, setDocumentHidden] = React.useState(() => typeof document !== 'undefined' && document.hidden);
  const [storyTransitioning, setStoryTransitioning] = React.useState(false);
  const [storyMotionId, setStoryMotionId] = React.useState<string | null>(null);
  const spotlightRegionRef = React.useRef<HTMLElement>(null);
  const spotlightIndexRef = React.useRef(0);
  const manualPauseUntilRef = React.useRef(0);
  const swipeStartRef = React.useRef<{x:number;y:number;mode:'pending'|'horizontal'|'vertical'}|null>(null);
  const swipedRef = React.useRef(false);
  const [manualVersion, setManualVersion] = React.useState(0);
  const activeIdRef = React.useRef<string | undefined>(undefined);
  const [inView, setInView] = React.useState(true);
  const pointerActiveRef = React.useRef(false);
  const pointerFocusedRef = React.useRef(false);
  const storyTransitionTimerRef = React.useRef<number | undefined>(undefined);
  const featured = events.slice(0, visibleCount);
  const fallbackSpotlights = React.useMemo(() => {
    const imageCandidates = events.filter((event) => event.imageUrl?.trim());
    if (!imageCandidates.length) return events.slice(0, 4);
    const chosen: HomeEvent[] = [];
    const usedImages = new Set<string>();
    const usedVenues = new Set<string>();
    const imageKey = (value: string) => {
      const trimmed = value.trim();
      try {
        const url = new URL(trimmed);
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch {
        return trimmed.split(/[?#]/, 1)[0];
      }
    };
    const addCandidate = (event: HomeEvent, uniqueVenue: boolean) => {
      if (chosen.length >= 4) return;
      const image = event.imageUrl?.trim();
      const imageId = image ? imageKey(image) : undefined;
      const venue = event.venueName?.trim() || event.id;
      if ((imageId && usedImages.has(imageId)) || (uniqueVenue && usedVenues.has(venue))) return;
      chosen.push(event);
      if (imageId) usedImages.add(imageId);
      usedVenues.add(venue);
    };
    // Prefer a different official image and venue for each beat. A second pass
    // still permits venue repeats when the source has fewer distinct venues.
    for (const uniqueVenue of [true, false]) {
      imageCandidates.forEach((event) => addCandidate(event, uniqueVenue));
    }
    // Keep the spotlight useful when only one or two records have official
    // imagery: complete it with image-less events, which use the date art.
    const imageLessCandidates = events.filter((event) => !event.imageUrl?.trim());
    for (const uniqueVenue of [true, false]) {
      imageLessCandidates.forEach((event) => addCandidate(event, uniqueVenue));
    }
    return chosen;
  }, [events]);
  const spotlights = largeEvents ?? fallbackSpotlights;
  const spotlightIds = React.useMemo(() => spotlights.map((event) => event.id).join('\u0001'), [spotlights]);
  const spotlightsRef = React.useRef(spotlights);
  spotlightsRef.current = spotlights;
  const safeSpotlightIndex = spotlights.length ? Math.min(spotlightIndex, spotlights.length - 1) : 0;
  activeIdRef.current ??= spotlights[safeSpotlightIndex]?.id;
  const spotlight = !loading && !error ? spotlights[safeSpotlightIndex] : undefined;
  const todayRecommended = todayEvents.slice(0, 4);
  const spotlightMotionActive = Boolean(spotlight && storyMotionId === spotlight.id);
  const [paused, setPaused] = React.useState(false);
  const motionStopped = reducedMotion || paused;
  const motionMode = reducedMotion ? 'reduced' : paused ? 'paused' : 'playing';

  React.useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener?.(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener?.(update);
    };
  }, []);

  React.useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  React.useEffect(() => {
    if (!spotlight) return;
    setStoryMotionId((current) => current ?? spotlight.id);
  }, [spotlight?.id]);

  React.useEffect(() => {
    const retainedIndex = spotlights.findIndex(event => event.id === activeIdRef.current);
    const nextIndex = retainedIndex >= 0 ? retainedIndex : 0;
    activeIdRef.current = spotlights[nextIndex]?.id;
    spotlightIndexRef.current = nextIndex;
    setSpotlightIndex(nextIndex);
    setTrackPosition(spotlights.length ? nextIndex + 1 : 0);
    setTrackTransitioning(false);
    setDragOffset(0);
    setDragging(false);
    setStoryTransitioning(false);
    setStoryMotionId((current) => current && spotlights.some((event) => event.id === current) ? current : null);
  }, [spotlightIds, spotlights.length]);

  const clearStoryTransitionTimer = React.useCallback(() => {
    if (storyTransitionTimerRef.current !== undefined) {
      window.clearTimeout(storyTransitionTimerRef.current);
      storyTransitionTimerRef.current = undefined;
    }
  }, []);

  const goToSpotlight = React.useCallback((nextIndex: number) => {
    const availableSpotlights = spotlightsRef.current;
    if (!availableSpotlights.length) return;
    const normalizedIndex = ((nextIndex % availableSpotlights.length) + availableSpotlights.length) % availableSpotlights.length;
    const currentIndex = spotlightIndexRef.current;
    if (currentIndex === normalizedIndex) return;
    spotlightIndexRef.current = normalizedIndex;
    activeIdRef.current = availableSpotlights[normalizedIndex].id;
    setStoryMotionId(availableSpotlights[normalizedIndex].id);
    setStoryTransitioning(!reducedMotion);
    setDragOffset(0);
    setDragging(false);
    clearStoryTransitionTimer();
    const wrapsForward = currentIndex === availableSpotlights.length - 1 && normalizedIndex === 0;
    const wrapsBackward = currentIndex === 0 && normalizedIndex === availableSpotlights.length - 1;
    const targetPosition = wrapsForward ? availableSpotlights.length + 1 : wrapsBackward ? 0 : normalizedIndex + 1;
    if (reducedMotion) {
      setTrackTransitioning(false);
      setTrackPosition(normalizedIndex + 1);
    } else {
      setTrackTransitioning(true);
      setTrackPosition(targetPosition);
      storyTransitionTimerRef.current = window.setTimeout(() => {
        storyTransitionTimerRef.current = undefined;
        setStoryTransitioning(false);
        if (wrapsForward || wrapsBackward) {
          setTrackTransitioning(false);
          setTrackPosition(normalizedIndex + 1);
        } else {
          setTrackTransitioning(false);
        }
      }, STORY_SWITCH_MS);
    }
    setSpotlightIndex(normalizedIndex);
  }, [clearStoryTransitionTimer, spotlightIds, reducedMotion]);

  const manualSpotlightAction = React.useCallback((nextIndex: number) => {
    manualPauseUntilRef.current = Date.now() + MANUAL_PAUSE_MS;
    setManualVersion(value => value + 1);
    goToSpotlight(nextIndex);
  }, [goToSpotlight]);

  React.useEffect(() => clearStoryTransitionTimer, [clearStoryTransitionTimer]);

  React.useEffect(() => {
    if (!spotlightRegionRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(spotlightRegionRef.current);
    return () => observer.disconnect();
  }, [Boolean(spotlight)]);

  React.useEffect(() => {
    if (motionStopped || spotlights.length < 2 || loading || error || documentHidden || !inView) return;
    let timer: number;
    const advance = () => {
      // A focused detail link must not change beneath the reader. Persistent
      // controls can retain focus while rotation resumes after manual use.
      const focusedSpotlight = spotlightRegionRef.current?.querySelector('.home-spotlight__viewport') === document.activeElement;
      const keyboardFocusedSpotlight = focusedSpotlight && !pointerFocusedRef.current;
      if (document.hidden || pointerActiveRef.current || keyboardFocusedSpotlight) {
        timer = window.setTimeout(advance, AUTO_ADVANCE_MS);
        return;
      }
      goToSpotlight(spotlightIndexRef.current + 1);
      timer = window.setTimeout(advance, AUTO_ADVANCE_MS);
    };
    const remainingPause = manualPauseUntilRef.current - Date.now();
    timer = window.setTimeout(advance, remainingPause > 0 ? remainingPause : AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [documentHidden, error, goToSpotlight, loading, motionStopped, spotlights.length, manualVersion, inView]);

  const finishPointer = (e: React.PointerEvent<HTMLElement>) => {
    pointerActiveRef.current = false;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    setDragging(false);
    if (!start) {
      setDragOffset(0);
      return;
    }
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    setDragOffset(0);
    const horizontalSwipe = (start.mode === 'horizontal' || start.mode === 'pending')
      && Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.15;
    if (horizontalSwipe) {
      swipedRef.current = true;
      manualSpotlightAction(spotlightIndexRef.current + (dx < 0 ? 1 : -1));
    } else if (start.mode === 'horizontal') {
      clearStoryTransitionTimer();
      setTrackTransitioning(true);
      storyTransitionTimerRef.current = window.setTimeout(() => {
        storyTransitionTimerRef.current = undefined;
        setTrackTransitioning(false);
      }, STORY_SWITCH_MS);
    }
  };
  const trackSlides = spotlights.length > 1
    ? [
      { event: spotlights[spotlights.length - 1], key: `clone-last-${spotlights[spotlights.length - 1].id}`, realIndex: -1 },
      ...spotlights.map((event, index) => ({ event, key: event.id, realIndex: index })),
      { event: spotlights[0], key: `clone-first-${spotlights[0].id}`, realIndex: -1 },
    ]
    : spotlights.map((event, index) => ({ event, key: event.id, realIndex: index }));
  const spotlightStyle = {
    '--spotlight-index': trackPosition,
    '--spotlight-offset': `${trackPosition * -100}%`,
    '--spotlight-drag': `${dragOffset}px`,
  } as React.CSSProperties;
  return (
    <section className={`home-discovery${query || activeFilterCount || timeFilter !== 'all' ? ' is-filtered' : ''}`} data-motion={motionMode} aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">大阪のイベント案内</p>
          <h1 id="home-title">今日の大阪、<br /><strong>よりみち日和。</strong></h1>
          <p>いつもの街で、まだ知らない体験を。</p>
          <label className="home-search"><Search size={18} aria-hidden="true" /><span className="sr-only">イベント名や場所を検索</span><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="イベント名や場所から探す" /></label>
          <div className="home-time-filters" aria-label="イベント一覧の開催日">{timeFilters.map(filter => <button type="button" key={filter.key} className={`home-time-chip ${timeFilter === filter.key ? 'is-active' : ''}`} aria-pressed={timeFilter === filter.key} onClick={() => onTimeFilterChange(filter.key)}>{filter.label}</button>)}</div>
          <button type="button" className="home-map-cta" onClick={onShowMap}>
            <MapPinned size={19} aria-hidden="true" />地図で近さを見る<ArrowRight size={17} aria-hidden="true" />
          </button>
          <small className="home-origin">距離は{originLabel}の直線距離です。</small>
        </div>
        {loading && !spotlight && <article className="home-spotlight is-loading" aria-label="注目イベントを読み込み中" aria-busy="true"><div className="home-spotlight__viewport"><div className="home-spotlight__story"><div className="home-spotlight__media"><div className="home-date-art"><span>大阪の予定を読み込み中</span></div></div><div className="home-spotlight__copy"><p>公式のイベント情報</p><h2>もうすぐ、次のよりみち。</h2></div></div></div></article>}
        {spotlight && <article className="home-spotlight" ref={spotlightRegionRef} aria-label="注目の大型イベント">
          <div className="home-spotlight__viewport" data-event-focus={`home-spotlight:${spotlight.id}`} role="button" tabIndex={0} aria-label={`注目イベント「${spotlight.eventName}」の詳細を見る`}
          onKeyDown={(e) => {
            pointerFocusedRef.current = false;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              manualSpotlightAction(spotlightIndexRef.current + (e.key === 'ArrowRight' ? 1 : -1));
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectEvent(spotlight.id, `home-spotlight:${spotlight.id}`);
            }
          }}
          onClick={(e) => {
            if (swipedRef.current) {
              e.preventDefault();
              swipedRef.current = false;
              return;
            }
            onSelectEvent(spotlight.id, `home-spotlight:${spotlight.id}`);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            pointerFocusedRef.current = true;
            pointerActiveRef.current = true;
            swipedRef.current = false;
            swipeStartRef.current = { x: e.clientX, y: e.clientY, mode: 'pending' };
          }}
          onPointerMove={(e) => {
            const start = swipeStartRef.current;
            if (!start) return;
            const signedDx = e.clientX - start.x;
            const dx = Math.abs(signedDx), dy = Math.abs(e.clientY - start.y);
            if (start.mode === 'pending' && dy > 12 && dy > dx * 1.15) {
              start.mode = 'vertical';
              setDragOffset(0);
              return;
            }
            if (start.mode === 'pending' && dx > 12 && dx > dy * 1.15) {
              start.mode = 'horizontal';
              setDragging(true);
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }
            if (start.mode === 'horizontal') setDragOffset(signedDx);
          }}
          onPointerUp={finishPointer}
          onPointerCancel={() => { pointerActiveRef.current = false; swipeStartRef.current = null; setDragging(false); setDragOffset(0); }}
          onBlur={() => { pointerFocusedRef.current = false; }}
          onLostPointerCapture={() => { pointerActiveRef.current = false; }}>
            <div className={`home-spotlight__track ${trackTransitioning ? 'is-track-animating' : ''} ${dragging ? 'is-dragging' : ''}`} style={spotlightStyle}>
              {trackSlides.map(({ event, key, realIndex }) => <div className={`home-spotlight__story ${realIndex === safeSpotlightIndex && spotlightMotionActive ? 'is-motion-active' : ''} ${realIndex === safeSpotlightIndex && storyTransitioning ? 'is-switching' : ''}`} key={key} aria-hidden={realIndex !== safeSpotlightIndex}>
                <div className="home-spotlight__media"><EventMedia event={event} priority={realIndex === safeSpotlightIndex} /></div>
                <div className="home-spotlight__copy"><p>大阪で今、注目のお出かけ</p><h2>{event.eventName}</h2><span>{event.venueName ?? '大阪府内'} ・ {event.timeLabel}</span><small>{event.description ?? '詳しい開催内容は公式サイトでご確認ください。'}</small></div>
              </div>)}
            </div>
          </div>
          <div className="home-spotlight__controls">{!reducedMotion && spotlights.length > 1 && <button type="button" className="home-motion-toggle" aria-label={paused ? '自動送りを再開' : '自動送りを停止'} onClick={() => setPaused(value => !value)}>{paused ? '再生' : '停止'}</button>}<button type="button" className="home-spotlight__arrow" disabled={spotlights.length < 2} aria-label="前の注目イベント" onClick={() => manualSpotlightAction(safeSpotlightIndex - 1)}><ArrowLeft size={18} aria-hidden="true" /></button><span className="home-spotlight__position" aria-label="現在のスライド">{safeSpotlightIndex + 1} / {spotlights.length}</span><button type="button" className="home-spotlight__arrow" disabled={spotlights.length < 2} aria-label="次の注目イベント" onClick={() => manualSpotlightAction(safeSpotlightIndex + 1)}><ArrowRight size={18} aria-hidden="true" /></button>{spotlights.length > 1 && <div className="home-spotlight__dots" aria-label="おすすめイベントを選択">{spotlights.map((item, index) => <button key={item.id} type="button" aria-label={`おすすめ${index + 1}件目を表示`} aria-current={index === safeSpotlightIndex} onClick={() => manualSpotlightAction(index)} />)}</div>}</div>
        </article>}
      </div>

      <div className="home-discovery__body" id="home-results" tabIndex={-1}>
        {searchControls}
        {!loading && !error && !query && timeFilter === 'all' && !activeFilterCount && !featureTitle && <>
          <section className="editorial-section editorial-ongoing" aria-labelledby="ongoing-title">
            <div className="editorial-section__heading"><div><p>今日を、少し特別に。</p><h2 id="ongoing-title">今日のピックアップ</h2></div><button type="button" onClick={() => onTimeFilterChange('today')}>すべて見る <ArrowRight size={16} /></button></div>
            <div className="discovery-picks">{todayRecommended.length ? todayRecommended.map(event => <DiscoveryCard key={event.id} event={event} scope="home-today" compact onSelect={onSelectEvent} onSave={onToggleSave} />) : <p className="editorial-empty">本日開催の確定したおすすめはありません。日付を変えて、次のお出かけを探してみませんか。</p>}</div>
          </section>
          {!!weekendEvents.length && <section className="editorial-section"><div className="editorial-section__heading"><div><p>予定を立てる楽しみを。</p><h2>今週末のお出かけ</h2></div><button type="button" onClick={() => onTimeFilterChange('weekend')}>すべて見る <ArrowRight size={16} /></button></div><div className="discovery-picks">{weekendEvents.slice(0, 4).map(event => <DiscoveryCard key={event.id} event={event} scope="home-weekend" compact onSelect={onSelectEvent} onSave={onToggleSave} />)}</div></section>}
          <section className="editorial-section editorial-discover" aria-labelledby="discover-title"><div className="editorial-section__heading"><div><p>あなたの過ごし方で。</p><h2 id="discover-title">探し方を選ぶ</h2></div></div><div className="editorial-axis-grid">
            <button type="button" onClick={onShowMap}><MapPinned size={24} /><span>場所から探す</span><small>近い会場を地図で比べる</small><ArrowRight size={17} /></button>
            <button type="button" onClick={onOpenFilters}><SlidersHorizontal size={24} /><span>好きなことから探す</span><small>エリア・ジャンル・無料</small><ArrowRight size={17} /></button>
            <button type="button" onClick={() => onTimeFilterChange('weekend')}><Sparkles size={24} /><span>週末の予定を探す</span><small>今週末に行ける催し</small><ArrowRight size={17} /></button>
          </div></section>
          {features.map(feature => <aside className="season-feature" key={feature.id}><div><p>季節の特集</p><h2>{feature.title}</h2><span>{feature.description}</span></div><button type="button" onClick={() => onFeatureSelect?.(feature.id)}>{feature.events.length}件のイベントを見る <ArrowRight size={18} /></button></aside>)}
        </>}
        <div className="home-discovery__facts" aria-label="イベント概要"><span><strong>{totalCount}</strong> 件の候補</span><span>公式情報から、大阪の予定を。</span></div>
        <div className="home-section-heading"><div><p>大阪の催しを探す</p><h2>{featureTitle ?? 'イベント一覧'}</h2>{featureDescription && <p className="feature-description">{featureDescription}</p>}</div><span>{events.length}件・{sortLabel}</span></div>
        {loading && <div className="home-state-card" role="status"><span className="loading-dot" />大阪のイベントを探しています…</div>}
        {error && <div className="home-state-card is-error" role="alert"><strong>{error}</strong><button type="button" onClick={onReset}>もう一度読み込む</button></div>}
        {!loading && !error && events.length === 0 && <div className="home-state-card"><strong>条件に合うイベントがありません</strong><span>検索語や日付、条件を少し広げてみてください。</span><button type="button" onClick={onReset}>すべての候補を見る</button></div>}
        {!loading && !error && featured.length > 0 && <><div className="home-featured-grid">{featured.map(event => <DiscoveryCard key={event.id} event={event} onSelect={onSelectEvent} onSave={onToggleSave} />)}</div>
          {visibleCount < events.length && <button type="button" className="home-more-button" onClick={() => setVisibleCount(count => count + 12)}>もっと見る（残り {events.length - visibleCount}件）</button>}
          <button type="button" className="home-secondary-map-cta" onClick={onShowMap}><MapPinned size={17} />候補を地図で比べる<ArrowRight size={16} /></button></>}
        {sourceStatus}
        <p className="data-note">大阪府などの公式公開データと公式サイトの情報を利用しています。「開催期間中」は会期の表示です。参加前に最新情報をご確認ください。</p>
      </div>
    </section>
  );
}
