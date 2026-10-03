import { ArrowLeft, ArrowRight, MapPinned, Search, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import './home-editorial.css';
import './website.css';
import './home-storytelling.css';
import { DiscoveryCard } from './DiscoveryCard';
import { eventImageIsPortrait, eventMediaKind, isLowResolutionEventImage, usableEventImage } from '../domain/eventPresentation';

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
  imageSource?: string;
  reservationRequired?: boolean;
  invitation?: string;
};

const AUTO_ADVANCE_MS = 8000;
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
  officialGuides?: React.ReactNode;
  hasOfficialGuides?: boolean;
  browseAll?: boolean;
  onBrowseAllChange?: (value: boolean) => void;
  onReset: () => void;
};

function EventMedia({ event, priority = false, onFailure }: { event: HomeEvent; priority?: boolean; onFailure?: () => void }) {
  const [imageState, setImageState] = React.useState({ url: '', failed: false, thumbnail: false, width: 0, height: 0 });
  const failed = imageState.url === event.imageUrl && imageState.failed;
  const thumbnail = imageState.url === event.imageUrl && imageState.thumbnail;
  const poster = eventMediaKind(event, imageState.url === event.imageUrl ? { width: imageState.width, height: imageState.height } : undefined) === 'poster';
  const portrait = imageState.url === event.imageUrl && eventImageIsPortrait(imageState);
  if (!event.imageUrl || failed) return <div className="home-date-art"><span>{event.timeLabel}</span><strong>{event.categoryLabel}</strong></div>;
  return <>
    <img className={[thumbnail && 'is-thumbnail', poster && 'is-poster', portrait && 'is-portrait'].filter(Boolean).join(' ')} src={event.imageUrl} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} width="1200" height="800" referrerPolicy="no-referrer" onLoad={e => setImageState({ url: event.imageUrl ?? '', failed: false, thumbnail: isLowResolutionEventImage({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }), width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => { setImageState({ url: event.imageUrl ?? '', failed: true, thumbnail: false, width: 0, height: 0 }); onFailure?.(); }} />
  </>;
}

export function HomeDiscovery({
  events, largeEvents, todayEvents = [], query, onQueryChange, timeFilter, timeFilters,
  onTimeFilterChange, onShowMap, onSelectEvent, onOpenFilters, activeFilterCount,
  loading, error, sourceStatus, officialGuides, hasOfficialGuides, onReset, visibleLimit, onVisibleLimitChange, onToggleSave, searchControls, weekendEvents = [], features = [], onFeatureSelect, featureTitle, featureDescription, sortLabel = '注目順', browseAll, onBrowseAllChange,
}: Props) {
  const [localVisibleCount, setLocalVisibleCount] = React.useState(6);
  const [localShowAll, setLocalShowAll] = React.useState(false);
  const showAll = browseAll ?? localShowAll;
  const setShowAll = (value: boolean) => onBrowseAllChange ? onBrowseAllChange(value) : setLocalShowAll(value);
  const filtered = Boolean(query || activeFilterCount || timeFilter !== 'all' || featureTitle);
  const showResults = filtered || showAll || !events.length;
  const visibleCount = visibleLimit ?? localVisibleCount;
  const setVisibleCount = (update: (count: number) => number) => {
    const value = update(visibleCount);
    if (onVisibleLimitChange) onVisibleLimitChange(value); else setLocalVisibleCount(value);
  };
  const [spotlightIndex, setSpotlightIndex] = React.useState(0);
  const [trackPosition, setTrackPosition] = React.useState(0);
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
  const [failedSpotlightImages, setFailedSpotlightImages] = React.useState<Set<string>>(() => new Set());
  const fallbackSpotlights = React.useMemo(() => {
    const imageCandidates = events.filter((event) => event.imageUrl?.trim());
    if (!imageCandidates.length) return [];
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
    return chosen;
  }, [events]);
  const spotlights = React.useMemo(() => {
    const available = (items: HomeEvent[]) => items.filter(event => usableEventImage(event) && !failedSpotlightImages.has(event.imageUrl ?? ''));
    const preferred = available(largeEvents ?? []);
    return preferred.length ? preferred : available(fallbackSpotlights);
  }, [largeEvents, fallbackSpotlights, failedSpotlightImages]);
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
    setTrackPosition(spotlights.length > 1 ? nextIndex + 1 : 0);
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
    <section className={`home-discovery${showResults ? ' is-filtered' : ''}`} data-motion={motionMode} aria-labelledby="home-title">
      <div className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">街の景色が、少し変わる。</p>
          <h1 id="home-title">今日の大阪、<strong>よりみち日和。</strong></h1>

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
                <div className="home-spotlight__media"><EventMedia event={event} priority={realIndex === safeSpotlightIndex} onFailure={() => setFailedSpotlightImages(previous => previous.has(event.imageUrl ?? '') ? previous : new Set([...previous, event.imageUrl ?? '']))} /></div>
                <div className="home-spotlight__copy"><p>{event.invitation ?? event.categoryLabel}</p><h2>{event.eventName}</h2><span>{event.venueName ?? '大阪府内'} ・ {event.timeLabel}</span>{event.reservationRequired && <small className="home-participation">事前予約が必要です</small>}<b className="home-story-action">この体験を見てみる <ArrowRight size={17} aria-hidden="true" /></b></div>
              </div>)}
            </div>
          </div>
          {spotlights.length > 1 && <div className="home-spotlight__controls">{!reducedMotion && spotlights.length > 1 && <button type="button" className="home-motion-toggle" aria-label={paused ? '自動送りを再開' : '自動送りを停止'} onClick={() => setPaused(value => !value)}>{paused ? '再生' : '停止'}</button>}<button type="button" className="home-spotlight__arrow" disabled={spotlights.length < 2} aria-label="前の注目イベント" onClick={() => manualSpotlightAction(safeSpotlightIndex - 1)}><ArrowLeft size={18} aria-hidden="true" /></button><span className="home-spotlight__position" aria-label="現在のスライド">{safeSpotlightIndex + 1} / {spotlights.length}</span><button type="button" className="home-spotlight__arrow" disabled={spotlights.length < 2} aria-label="次の注目イベント" onClick={() => manualSpotlightAction(safeSpotlightIndex + 1)}><ArrowRight size={18} aria-hidden="true" /></button>{spotlights.length > 1 && <div className="home-spotlight__dots" aria-label="おすすめイベントを選択">{spotlights.map((item, index) => <button key={item.id} type="button" aria-label={`おすすめ${index + 1}件目を表示`} aria-current={index === safeSpotlightIndex} onClick={() => manualSpotlightAction(index)} />)}</div>}</div>}
        </article>}
      </div>

      <div className="home-discovery__body" id="home-results" tabIndex={-1}>
        <section className="home-search-entry" aria-label="イベントを探す">
          <div className="home-search-entry__heading"><p>次の予定を、見つけよう。</p><span>日付や場所から選べます</span></div>
          <label className="home-search" id="home-search"><Search size={18} aria-hidden="true" /><span className="sr-only">イベント名や場所を検索</span><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="イベント名や場所から探す" /></label>
          <div className="home-time-filters" aria-label="イベント一覧の開催日">{timeFilters.filter(filter => showResults || ['all', 'today', 'weekend'].includes(filter.key)).map(filter => <button type="button" key={filter.key} className={`home-time-chip ${timeFilter === filter.key ? 'is-active' : ''}`} aria-pressed={timeFilter === filter.key} onClick={() => { if (filter.key === 'all') setShowAll(true); onTimeFilterChange(filter.key); }}>{filter.label}</button>)}<button type="button" className="home-time-chip home-condition-entry" onClick={onOpenFilters}><SlidersHorizontal size={15} aria-hidden="true" />条件を選ぶ</button></div>
        </section>
        {showResults && searchControls}
        {!loading && !error && !filtered && !showAll && <>
          {features.map(feature => <section className="season-story" key={feature.id} aria-labelledby={`season-${feature.id}`}>
            <div className="season-story__copy"><p>季節のよりみち</p><h2 id={`season-${feature.id}`}>{feature.title}</h2><span>{feature.description}</span><button type="button" onClick={() => onFeatureSelect?.(feature.id)}>この季節の予定を見る <ArrowRight size={18} aria-hidden="true" /></button></div>
            <div className="season-story__events">{feature.events.slice(0, 2).map(event => <DiscoveryCard key={event.id} event={event} scope="home-season" compact onSelect={onSelectEvent} onSave={onToggleSave} />)}</div>
          </section>)}
          <section className="editorial-section editorial-ongoing" aria-labelledby="ongoing-title">
            <div className="editorial-section__heading"><div><p>今日を、少し特別に。</p><h2 id="ongoing-title">今日のピックアップ</h2></div><button type="button" onClick={() => onTimeFilterChange('today')}>すべて見る <ArrowRight size={16} aria-hidden="true" /></button></div>
            <div className="discovery-picks">{todayRecommended.length ? todayRecommended.map(event => <DiscoveryCard key={event.id} event={event} scope="home-today" compact onSelect={onSelectEvent} onSave={onToggleSave} />) : <p className="editorial-empty">今日のおすすめはありません。日付を変えて、次のお出かけを探してみませんか。</p>}</div>
          </section>
          {!!weekendEvents.length && <section className="editorial-section editorial-weekend"><div className="editorial-section__heading"><div><p>少し先の、楽しみを。</p><h2>今週末のお出かけ</h2></div><button type="button" onClick={() => onTimeFilterChange('weekend')}>すべて見る <ArrowRight size={16} aria-hidden="true" /></button></div><div className="discovery-weekend">{weekendEvents.slice(0, 4).map(event => <DiscoveryCard key={event.id} event={event} scope="home-weekend" compact onSelect={onSelectEvent} onSave={onToggleSave} />)}</div></section>}
          <section className="home-place-story" aria-labelledby="place-title"><div className="home-place-story__map" aria-hidden="true"><span className="place-river" /><span className="place-label place-label--kita">梅田・中之島</span><span className="place-label place-label--minami">なんば・心斎橋</span><span className="place-label place-label--tennoji">天王寺・あべの</span><MapPinned size={36} /></div><div><p>いつもの街の、その先へ。</p><h2 id="place-title">場所から、よりみち。</h2><span>気になる会場の位置を見ながら、<br />次に行く場所を決めてみませんか。</span><button type="button" onClick={onShowMap}>大阪の地図を開く <ArrowRight size={18} aria-hidden="true" /></button><small>イラストはエリアの案内です。会場の位置は地図で確認できます。</small></div></section>
          <div className="home-browse-entry"><h2>まだ出会っていない、<br />大阪の予定へ。</h2><button type="button" onClick={() => { setShowAll(true); document.querySelector('.home-search-entry')?.scrollIntoView?.({ behavior: 'auto' }); }}>すべてのイベントを探す <ArrowRight size={18} aria-hidden="true" /></button></div>
        </>}
        {showResults && <section className="home-results-list" aria-label="検索結果">
          <div className="home-section-heading"><div><p>日付と場所から、次の予定へ。</p><h2>{featureTitle ?? 'イベント一覧'}</h2>{featureDescription && <p className="feature-description">{featureDescription}</p>}</div><span>{events.length}件・{sortLabel}</span></div>
          <button type="button" className="home-results-reset" onClick={() => { setShowAll(false); onReset(); }}>ホームのおすすめに戻る</button>
          {loading && <div className="home-state-card" role="status"><span className="loading-dot" />大阪のイベントを探しています…</div>}
          {error && <div className="home-state-card is-error" role="alert"><strong>{error}</strong><button type="button" onClick={onReset}>もう一度読み込む</button></div>}
          {!loading && !error && events.length === 0 && <div className="home-state-card"><strong>{hasOfficialGuides ? '日時が確定したイベントはありません' : '条件に合うイベントがありません'}</strong><span>{hasOfficialGuides ? '開催日確定前の公式案内があります。開花予想をご確認ください。' : '検索語や日付、条件を少し広げてみてください。'}</span><button type="button" onClick={onReset}>すべての候補を見る</button></div>}
          {!loading && !error && featured.length > 0 && <><div className="home-featured-grid">{featured.map(event => <DiscoveryCard key={event.id} event={event} onSelect={onSelectEvent} onSave={onToggleSave} />)}</div>
            {visibleCount < events.length && <button type="button" className="home-more-button" onClick={() => setVisibleCount(count => count + 12)}>もっと見る（残り {events.length - visibleCount}件）</button>}
            <button type="button" className="home-secondary-map-cta" onClick={onShowMap}><MapPinned size={17} aria-hidden="true" />候補を地図で比べる<ArrowRight size={16} aria-hidden="true" /></button></>}
        </section>}
        {officialGuides}
        {!showResults && loading && <div className="home-state-card" role="status">大阪のイベントを探しています…</div>}
        {!showResults && error && <div className="home-state-card is-error" role="alert"><strong>{error}</strong><button type="button" onClick={onReset}>もう一度読み込む</button></div>}
        <footer className="home-footer"><p>どこいこ大阪 <span>いつもの街で、まだ知らない体験を。</span></p><details className="home-source-guide"><summary>情報源・更新について</summary><p className="data-note">大阪府などの公式公開データと公式サイトの情報を利用しています。「開催期間中」は会期の表示です。参加前に最新情報をご確認ください。</p>{sourceStatus}</details></footer>
      </div>
    </section>
  );
}
