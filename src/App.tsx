import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { DiscoveryHeader } from './components/DiscoveryHeader';
import { DiscoveryIntro } from './components/DiscoveryIntro';
import { EventMap } from './components/EventMap';
import { EventDetailPage, type DetailEvent } from './components/EventDetailPage';
import { FilterSheet, type EventFilters } from './components/FilterSheet';
import { ProfileDialog, type Profile } from './components/ProfileDialog';
import { HomeDiscovery, type HomeEvent } from './components/HomeDiscovery';
import { CoverageStatus, parseCoverageData, type CoverageData } from './components/CoverageStatus';
import {
  appleMapsUrl,
  calculateDistanceKm,
  eventAttentionScore,
  calculateRecommendationScore,
  CATEGORY_LABELS,
  detailRecommendations,
  estimateTravelTimeMinutes,
  filterEvents,
  hasCoordinates,
  hasEventTag,
  eventTagLabels,
  googleMapsUrl,
  isOngoing,
} from './domain';
import { recommendHomeEvents, recommendWeekendEvents } from './domain/homeRecommendations';
import { useBookmarks } from './hooks/useBookmarks';
import { SearchControls } from './components/SearchControls';
import { DiscoveryCard } from './components/DiscoveryCard';
import { editorialFeatures, eventArea } from './domain/discovery';
import { cardPriceLabel, eventFreshness, eventStatusLabel, usableEventImage } from './domain/eventPresentation';
import { occursOnDate } from './domain/events';
import { useEventNavigation } from './hooks/useEventNavigation';
import type { EventDataFile, EventItem, EventSource, TimeFilter, UserProfile } from './types';

type DataFile = EventDataFile;

type RankedEvent = EventItem & {
  distanceKm?: number;
  travelMinutes?: number;
  recommendation: number;
  attention: number;
  recommendationReasons: string[];
};

const STORAGE_KEY = 'dokoiko-osaka-profile-v1';
const TIME_FILTERS: { key: TimeFilter; label: string; accent?: boolean }[] = [
  { key: 'all', label: 'これから' },
  { key: 'today', label: '今日' },
  { key: 'tonight', label: '今夜', accent: true },
  { key: 'tomorrow', label: '明日' },
  { key: 'upcoming', label: '近日開催' },
  { key: 'weekend', label: '今週末' },
];

const sourceStatusLabels: Record<EventSource['status'], string> = { success: '取得済み', error: '取得失敗', stale: '更新確認が古い可能性' };

function SourceStatusDetails({ sources }: { sources: EventSource[] }) {
  const checked = sources.filter((source) => source.status === 'success').length;
  const warnings = sources.length - checked;
  const checkedAt = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  return <details className="source-status-details">
    <summary>公式ソース {checked}/{sources.length}件を確認{warnings > 0 ? ` ・ 注意 ${warnings}件` : ''}</summary>
    <div className="source-status-details__body">
      {warnings > 0 && <p role="status">一部情報の更新確認に失敗しています。参加前に公式サイトで最新情報をご確認ください。</p>}
      {sources.map((source) => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> ・ {sourceStatusLabels[source.status]} ・ 確認 {checkedAt(source.checkedAt)}{source.error ? `：${source.error}` : ''}</p>)}
    </div>
  </details>;
}

function readProfile(): Profile {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Profile;
  } catch {
    return {};
  }
}

function domainProfile(profile: Profile): UserProfile {
  const companionMap: Record<string, UserProfile['companion']> = {
    'ひとり': 'solo', '恋人・夫婦': 'partner', '友達': 'friends', '家族': 'family',
  };
  const transportMap: Record<string, UserProfile['transport']> = { '車': 'car', '電車': 'train', '徒歩・自転車': 'walk' };
  const favoriteMap: Record<string, string[]> = {
    '祭り': ['festival'], 'グルメ': ['food', 'market'], '展覧会': ['exhibition', 'museum'],
    '自然': ['seasonal', 'workshop'], '夜イベント': ['night', 'illumination', 'fireworks'],
  };
  return {
    companion: profile.companion ? companionMap[profile.companion] : undefined,
    hasChildren: profile.children ? profile.children !== 'なし' : undefined,
    childAge: profile.children,
    transport: profile.transport ? transportMap[profile.transport] : 'train',
    favoriteCategories: profile.favorites?.flatMap((item) => favoriteMap[item] ?? []),
    maxTravelMinutes: profile.maxMinutes === 0 ? null : profile.maxMinutes,
  };
}

function recommendationReasons(event: EventItem, profile: UserProfile, distanceKm: number | undefined, now: Date) {
  const reasons: string[] = [];
  if (isOngoing(event, now)) reasons.push('開催期間中（開催日時は公式確認）');
  if (profile.favoriteCategories?.includes(event.category)) reasons.push('好きなジャンル');
  if (profile.hasChildren && event.childFriendly) reasons.push('子どもと楽しめる');
  if (profile.companion === 'partner' && event.dateFriendly) reasons.push('ふたりのお出かけ向き');
  if (hasEventTag(event, 'free')) reasons.push('無料');
  if (typeof distanceKm === 'number' && Number.isFinite(distanceKm) && distanceKm < 10) reasons.push('近くて行きやすい');
  return reasons.slice(0, 2);
}



function timeLabel(event: EventItem) {
  const formatter = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' });
  const start = new Date(`${event.startDate}T00:00:00+09:00`);
  if (!Number.isFinite(start.getTime())) return '開催日を確認';
  const date = formatter.format(start);
  const time = event.startTime ? ` ${event.startTime.slice(0, 5)}` : '';
  const end = event.endDate && event.endDate !== event.startDate
    ? `〜${new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: event.endDate.slice(0, 4) !== event.startDate.slice(0, 4) ? 'numeric' : undefined, month: 'numeric', day: 'numeric' }).format(new Date(`${event.endDate}T00:00:00+09:00`))}`
    : '';
  return `${date}${end}${time}`;
}

export function App() {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [locationNotice, setLocationNotice] = useState('');
  const [data, setData] = useState<DataFile | null>(null);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [coverageError, setCoverageError] = useState('');
  const [coverageAttempt, setCoverageAttempt] = useState(0);
  const [error, setError] = useState('');
  const loading = !data && !error;
  const [profile, setProfile] = useState<Profile>(() => readProfile());
  const [filterOpen, setFilterOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigation = useEventNavigation(!!data);
  const { surface, detailId, updateSurface } = navigation;
  const { view, query, timeFilter, filters, origin, originLabel, mapListLimit, railLimit } = surface;
  const setView = (value: 'home' | 'map' | 'saved') => updateSurface('view', value);
  const setQuery = (value: string) => updateSurface('query', value);
  const setTimeFilter = (value: TimeFilter) => { updateSurface('timeFilter', value); updateSurface('filters', old => ({ ...old, selectedDate: undefined })); };
  const bookmarks = useBookmarks();
  const setFilters = (value: EventFilters) => updateSurface('filters', value);
  useEffect(() => { setFilterOpen(false); setProfileOpen(false); }, [navigation.entryKey]);
  useEffect(() => {
    if (error && detailId) document.querySelector<HTMLElement>('.event-detail-page')?.focus({ preventScroll: true });
  }, [error, detailId]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`${import.meta.env.BASE_URL}data/events.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DataFile>;
      })
      .then(payload => setData({ ...payload, events: payload.events.map(event => ({ ...event, sourceStatus: payload.sources?.find(source => source.id === event.sourceId)?.status ?? event.sourceStatus })) }))
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== 'AbortError') setError('イベント情報を読み込めませんでした。通信を確認して再読み込みしてください。');
      });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    setCoverageError('');
    fetch(`${import.meta.env.BASE_URL}data/coverage.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        const parsed = parseCoverageData(value);
        if (!parsed) throw new Error('invalid coverage data');
        setCoverage(parsed);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== 'AbortError') setCoverageError('収集範囲を読み込めませんでした。');
      });
    return () => controller.abort();
  }, [coverageAttempt]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const userProfile = useMemo(() => domainProfile(profile), [profile]);
  const ranked = useMemo<RankedEvent[]>(() => {
    if (!data) return [];
    const normalizedQuery = query.normalize('NFKC').trim().toLocaleLowerCase('ja');
    return filterEvents(data.events, filters.selectedDate ? 'all' : timeFilter, now)
      .map((event) => {
        const distanceKm = hasCoordinates(event)
          ? calculateDistanceKm(origin, { latitude: event.latitude, longitude: event.longitude })
          : undefined;
        const travelMinutes = distanceKm == null ? undefined : estimateTravelTimeMinutes(distanceKm, userProfile.transport ?? 'train');
        const recommendation = calculateRecommendationScore(event, userProfile, distanceKm);
        return {
          ...event,
          ...(distanceKm == null ? {} : { distanceKm }),
          ...(travelMinutes == null ? {} : { travelMinutes }),
          recommendation,
          attention: eventAttentionScore(event, recommendation, now),
          recommendationReasons: recommendationReasons(event, userProfile, distanceKm, now),
        };
      })
      .filter((event) => {
        if (normalizedQuery) {
          const searchable = [event.eventName, event.venueName, event.address, CATEGORY_LABELS[event.category], ...eventTagLabels(event)]
            .filter(Boolean)
            .join(' ')
            .normalize('NFKC')
            .toLocaleLowerCase('ja');
          if (!searchable.includes(normalizedQuery)) return false;
        }
        if (filters.selectedDate && !occursOnDate(event, filters.selectedDate)) return false;
        if (filters.area && eventArea(event) !== filters.area) return false;
        if (filters.feature && !editorialFeatures([event], now).length) return false;
        if (filters.withinMinutes && (event.travelMinutes == null || event.travelMinutes > filters.withinMinutes)) return false;
        if (filters.free && !hasEventTag(event, 'free')) return false;
        if (filters.rainOk && event.rainSupport !== true && event.indoor !== true) return false;
        if (filters.family && !hasEventTag(event, 'family')) return false;
        if (filters.tags?.some((tag) => !hasEventTag(event, tag))) return false;
        if (filters.date && event.dateFriendly !== true) return false;
        if (filters.night && !['night', 'illumination', 'fireworks'].includes(event.category)) return false;
        if (filters.categories?.length && !filters.categories.includes(event.category)) return false;
        return true;
      })
      .sort((a, b) => (filters.sort === 'date' ? a.startDate.localeCompare(b.startDate) : b.attention - a.attention) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  }, [data, filters, now, origin, query, timeFilter, userProfile]);

  const detailBase = detailId ? data?.events.find((event) => (event.routeId ?? event.id) === detailId || event.id === detailId) ?? null : null;
  const detailEvent = useMemo<DetailEvent | null>(() => {
    if (!detailBase) return null;
    const distanceKm = hasCoordinates(detailBase)
      ? calculateDistanceKm(origin, { latitude: detailBase.latitude, longitude: detailBase.longitude })
      : undefined;
    const travelMinutes = distanceKm == null ? undefined : estimateTravelTimeMinutes(distanceKm, userProfile.transport ?? 'train');
    return { ...detailBase, originLabel, ...(distanceKm == null ? {} : { distanceKm }), ...(travelMinutes == null ? {} : { travelMinutes }) };
  }, [detailBase, origin, originLabel, userProfile.transport]);
  const detailRelated = useMemo(() => detailBase && data
    ? detailRecommendations(detailBase, data.events, now)
    : { nearbyOngoing: [], sameArea: [] }, [data, detailBase, now]);
  const liveCount = ranked.filter((event) => isOngoing(event, now)).length;
  const mapEvents = ranked.map((event, index) => ({
    ...event,
    latitude: hasCoordinates(event) ? event.latitude : undefined,
    longitude: hasCoordinates(event) ? event.longitude : undefined,
    displayLabel: index < 4 && hasCoordinates(event),
  }));
  const activeTagCount = new Set([...(filters.tags ?? []), ...(filters.free ? ['free'] as const : [])]).size;
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'tags' && key !== 'free' && key !== 'sort' && (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false)).length + activeTagCount;
  const homeRanked = ranked;
  const homeEvents = useMemo<HomeEvent[]>(() => homeRanked.map((event) => ({
    id: event.id,
    routeId: event.routeId,
    distanceKm: event.distanceKm,
    priceLabel: cardPriceLabel(event),
    statusLabel: eventStatusLabel(event, now),
    saved: bookmarks.has(event.routeId ?? event.id),
    eventName: event.eventName,
    categoryLabel: CATEGORY_LABELS[event.category] ?? 'イベント',
    venueName: event.venueName,
    timeLabel: timeLabel(event),
    travelMinutes: event.travelMinutes,
    recommendation: event.recommendation,
    ongoing: isOngoing(event, now),
    description: event.description,
    imageUrl: usableEventImage(event),
  })), [now, homeRanked, bookmarks.items]);

  const homeRecommendations = useMemo(() => recommendHomeEvents(data?.events ?? [], now, { todayLimit: 4 }), [data, now]);
  const recommendationHomeEvent = (event: EventItem): HomeEvent => {
    const distanceKm = hasCoordinates(event)
      ? calculateDistanceKm(origin, { latitude: event.latitude, longitude: event.longitude })
      : undefined;
    return {
      id: event.id,
      routeId: event.routeId,
      distanceKm,
      priceLabel: cardPriceLabel(event),
      statusLabel: eventStatusLabel(event, now),
      saved: bookmarks.has(event.routeId ?? event.id),
      eventName: event.eventName,
      categoryLabel: CATEGORY_LABELS[event.category] ?? 'イベント',
      venueName: event.venueName,
      timeLabel: timeLabel(event),
      travelMinutes: distanceKm == null ? undefined : estimateTravelTimeMinutes(distanceKm, userProfile.transport ?? 'train'),
      recommendation: calculateRecommendationScore(event, userProfile, distanceKm),
      ongoing: isOngoing(event, now),
      description: event.description,
      imageUrl: usableEventImage(event),
    };
  };
  const largeHomeEvents = homeRecommendations.large.map(({ event }) => recommendationHomeEvent(event));
  const todayHomeEvents = homeRecommendations.today.map(({ event }) => recommendationHomeEvent(event));

  const openDetail = useCallback((eventId: string, focus?: string) => {
    const event = data?.events.find((item) => item.id === eventId);
    if (event) navigation.open(event.routeId ?? event.id, focus);
  }, [data?.events, navigation.open]);
  const saveProfile = (next: Profile) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setProfile(next); }
    catch { setLocationNotice('好みを保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  };
  const locate = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationNotice('このローカル接続では現在地を利用できません。大阪駅を起点に表示しています。');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      updateSurface('origin', { latitude: coords.latitude, longitude: coords.longitude });
      updateSurface('originLabel', '現在地から');
      setLocationNotice('');
    }, () => setLocationNotice('現在地を取得できませんでした。位置情報の許可を確認してください。'), { timeout: 10000 });
  };
  const navigate = (provider: 'apple' | 'google', target: EventItem) => {
    if (!target) return;
    window.open(provider === 'apple' ? appleMapsUrl(target) : googleMapsUrl(target), '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const defaultTitle = 'どこいこ大阪｜イベント発見マップ';
    document.title = detailEvent ? `${detailEvent.eventName}｜どこいこ大阪` : defaultTitle;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = detailEvent?.description?.slice(0, 150) || '大阪で今日・今夜・週末に行けるイベントを見つける';
  }, [detailEvent]);

  const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const resetSearch = () => { setQuery(''); setTimeFilter('all'); setFilters({}); };
  const toggleSave = (id: string) => { const item = data?.events.find(event => event.id === id); if (item) bookmarks.toggle(item); };
  const features = editorialFeatures(filterEvents(data?.events ?? [], 'all', now), now);
  const feature = filters.feature ? features.find(item => item.id === filters.feature) : undefined;
  const searchControls = <SearchControls filters={filters} onChange={setFilters} onOpenFilters={() => setFilterOpen(true)} onReset={resetSearch}
    query={query} onClearQuery={() => setQuery('')} today={todayKey}
    dateLabel={filters.selectedDate ?? (timeFilter !== 'all' ? TIME_FILTERS.find(item => item.key === timeFilter)?.label : undefined)}
    onClearDate={() => setTimeFilter('all')} />;
  const weekendEvents = recommendWeekendEvents(data?.events ?? [], now).map(recommendationHomeEvent);
  return (
    <>
    <div className="app-surface" hidden={!!detailId}>
    <main className={`app-shell ${view === 'map' ? 'is-map' : 'is-home'}`}>
      <a className="skip-link" href={view !== 'map' ? '#home-results' : '#event-results'}>候補へ移動</a>
      <DiscoveryHeader
        liveCount={liveCount}
        originLabel={originLabel}
        onLocate={locate}
        onOpenProfile={() => setProfileOpen(true)}
        view={view}
        onShowHome={() => setView('home')}
        onShowMap={() => setView('map')}
        onShowSaved={() => setView('saved')}
        savedCount={bookmarks.items.length}
      />
      {locationNotice && <div className="location-notice" role="status">{locationNotice}<button type="button" onClick={() => setLocationNotice('')}>閉じる</button></div>}
      {bookmarks.notice && <div className="location-notice" role="alert">{bookmarks.notice}<button type="button" onClick={bookmarks.dismiss}>閉じる</button></div>}
      {view === 'saved' ? <section className="saved-page" id="home-results" tabIndex={-1}><p>また行きたいを、ここに。</p><h1>保存したイベント</h1><p>このブラウザに保存されます。別の端末には同期されません。</p>
        {!bookmarks.items.length && <div className="home-state-card"><strong>まだ保存したイベントはありません</strong><p>気になるイベントのしおりマークで、予定を残せます。</p><button type="button" onClick={() => setView('home')}>イベントを探す</button></div>}
        {loading && <p role="status">保存したイベントの最新情報を読み込んでいます。</p>}{error && <p role="alert">{error} 保存時の情報を表示しています。</p>}
        <div className="saved-grid">{bookmarks.items.map(saved => {
          const current = data?.events.find(event => (event.routeId ?? event.id) === saved.routeId);
          if (loading && !current) return null;
          return current ? <DiscoveryCard key={saved.routeId} event={recommendationHomeEvent(current)} scope="saved" onSelect={openDetail} onSave={toggleSave} />
            : <article className="saved-unavailable" key={saved.routeId}><small>{(saved.endDate ?? saved.startDate) < todayKey ? '終了' : '最新情報を確認できません'}</small><h2>{saved.eventName}</h2><p>{saved.startDate}{saved.venueName ? ` · ${saved.venueName}` : ''}</p><p>保存時の情報です。掲載内容が変更された可能性があります。</p><button type="button" aria-label={`${saved.eventName}を保存から解除`} onClick={() => bookmarks.remove(saved.routeId)}>保存から解除</button></article>;
        })}</div></section> : view === 'home' ? <HomeDiscovery
        originLabel={originLabel}
        visibleLimit={surface.homeLimit}
        onVisibleLimitChange={(value) => updateSurface('homeLimit', value)}
        events={homeEvents}
        onToggleSave={toggleSave}
        searchControls={searchControls}
        weekendEvents={weekendEvents}
        features={features.map(item => ({ ...item, events: item.events.map(recommendationHomeEvent) }))}
        onFeatureSelect={id => { setQuery(''); setTimeFilter('all'); setFilters({ feature: id }); document.querySelector('#home-results')?.scrollIntoView({ behavior: 'auto' }); }}
        featureTitle={feature?.title}
        featureDescription={feature?.description}
        sortLabel={filters.sort === 'date' ? '開催日順' : '注目順'}
        largeEvents={largeHomeEvents}
        todayEvents={todayHomeEvents}
        totalCount={ranked.length}
        liveCount={liveCount}
        query={query}
        onQueryChange={setQuery}
        timeFilter={timeFilter}
        timeFilters={TIME_FILTERS}
        onTimeFilterChange={(key) => { setTimeFilter(key as TimeFilter); }}
        onShowMap={() => setView('map')}
        onSelectEvent={openDetail}
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        loading={!data && !error}
        error={error}
        sourceStatus={<>
          <CoverageStatus data={coverage} loading={!coverage && !coverageError} error={coverageError} onRetry={() => setCoverageAttempt((value) => value + 1)} />
          {data?.sources?.length ? <SourceStatusDetails sources={data.sources} /> : null}
        </>}
        onReset={() => { setQuery(''); setTimeFilter('all'); setFilters({}); setLoadAttempt((value) => value + 1); }}
      /> : <>
      <div className="map-controls"><section className="time-toolbar" aria-label="開催日の絞り込み">
        <label className="event-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">イベント名や場所を検索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="イベント名や場所から探す" />
        </label>
        <div className="time-scroll">
          {TIME_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`time-chip ${timeFilter === item.key ? 'is-active' : ''} ${item.accent ? 'is-tonight' : ''}`}
              aria-pressed={timeFilter === item.key}
              onClick={() => { setTimeFilter(item.key); }}
            >
              {item.accent && <Sparkles size={15} aria-hidden="true" />}{item.label}
            </button>
          ))}
        </div>
        <button type="button" className="filter-button" onClick={() => setFilterOpen(true)} aria-label={`条件を追加${activeFilterCount ? `、${activeFilterCount}件適用中` : ''}`}>
          <SlidersHorizontal size={18} /><span>条件</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        </button>
      </section>{searchControls}<p className="map-coverage">{originLabel} · 地図に表示 {ranked.filter(hasCoordinates).length}件 · 座標未確認 {ranked.filter(event => !hasCoordinates(event)).length}件（ホームの一覧で確認できます）</p></div>

      <div className="workspace">
        <aside className="results-panel" id="event-results" aria-label="イベント候補">
          <DiscoveryIntro count={ranked.length} liveCount={liveCount} originLabel={originLabel} />
          <div className="results-heading">
            <div><span className="eyebrow">今日のおすすめ</span><h2>今から選べる行き先</h2></div>
            <span className="results-count">{ranked.length}件</span>
          </div>
          {error && <div className="state-card is-error" role="alert">{error}<button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>再読み込み</button></div>}
          {!data && !error && <div className="state-card" role="status"><span className="loading-dot" />大阪のイベントを探しています…</div>}
          {data && ranked.length === 0 && <div className="state-card"><strong>条件に合うイベントがありません</strong><span>検索語や時間、条件を少し広げてみてください。</span><button type="button" onClick={() => { setQuery(''); setTimeFilter('all'); setFilters({}); }}>すべての候補を見る</button></div>}
          <div className="event-list">
            {ranked.slice(0, mapListLimit).map((event, index) => (
              <button key={event.id} type="button" className="event-row" data-event-focus={`map-list:${event.id}`} onClick={() => openDetail(event.id, `map-list:${event.id}`)}>
                <span className={`rank-badge ${isOngoing(event, now) ? 'is-live' : ''}`}>{eventFreshness(event, now) && isOngoing(event, now) ? '会期内' : index + 1}</span>
                <span className="event-row-copy">
                  <span className="event-row-top"><b>{CATEGORY_LABELS[event.category] ?? 'イベント'}</b><em>おすすめ {event.recommendation}%</em></span>
                  <strong>{event.eventName}</strong>
                  <span>{timeLabel(event)} ・ {event.distanceKm !== undefined ? `直線 ${event.distanceKm.toFixed(1)}km` : '場所は詳細で確認'} ・ {event.price ?? (hasEventTag(event, 'free') ? '無料（条件あり）' : '料金は公式確認')}</span>
                </span>
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            ))}
          </div>
          {mapListLimit < ranked.length && <button type="button" className="map-more-button" onClick={() => updateSurface('mapListLimit', (limit) => Math.min(ranked.length, limit + 20))}>もっと見る（残り {ranked.length - mapListLimit}件）</button>}
          {data && <p className="data-note">公式公開データと公式サイトの情報を利用しています。内容は参加前に公式サイトで確認してください。</p>}
          {data?.sources?.length ? <SourceStatusDetails sources={data.sources} /> : null}
          <CoverageStatus data={coverage} loading={!coverage && !coverageError} error={coverageError} onRetry={() => setCoverageAttempt((value) => value + 1)} />
        </aside>

        <section className="map-panel" tabIndex={-1} aria-label="大阪府イベントマップ">
          <EventMap events={mapEvents} onEventSelect={(event) => openDetail(event.id, `map-pin:${event.id}`)}
            viewport={surface.viewport} onViewportChange={(value) => updateSurface('viewport', value)} active={!detailId} />
          <div className="map-summary" aria-live="polite">
            <span><i className="live-indicator" />地図に{ranked.filter(hasCoordinates).length}件</span>
            <strong><small>{originLabel}</small>今日は、どこへ行く？</strong>
          </div>
          {ranked.length > 0 && (
            <div className="discovery-rail" role="region" aria-label="おすすめ候補">
            <div className="rail-title"><span>今から出会う、大阪</span><b>横にスワイプ</b></div>
              <div className="rail-cards">
                {ranked.slice(0, railLimit).map((event) => (
                  <button key={event.id} type="button" data-event-focus={`map-rail:${event.id}`} onClick={() => openDetail(event.id, `map-rail:${event.id}`)}>
                    <span>{eventStatusLabel(event, now)} ・ {CATEGORY_LABELS[event.category] ?? 'イベント'}</span>
                    <strong>{event.eventName}</strong>
                    <small>{event.distanceKm !== undefined ? `直線 ${event.distanceKm.toFixed(1)}km` : '場所は詳細で確認'}</small>
                  </button>
                ))}
              </div>
              {railLimit < ranked.length && <button type="button" className="rail-more-button" onClick={() => updateSurface('railLimit', (limit) => Math.min(ranked.length, limit + 12))}>もっと見る（残り {ranked.length - railLimit}件）</button>}
            </div>
          )}
          {data && ranked.length === 0 && (
            <div className="map-empty" role="status">
              <strong>この条件のイベントは見つかりませんでした</strong>
              <span>時間や距離を広げると候補が増えます。</span>
              <button type="button" onClick={() => { setQuery(''); setTimeFilter('all'); setFilters({}); }}>これから行ける候補を見る</button>
            </div>
          )}
        </section>
      </div>
      </>}
      {(filterOpen || profileOpen) && <div className="modal-scrim" aria-hidden="true" />}
      <FilterSheet
        open={filterOpen}
        value={filters}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        categories={Object.keys(CATEGORY_LABELS)}
      />
      <ProfileDialog open={profileOpen} value={profile} onChange={setProfile} onSave={saveProfile} onClose={() => setProfileOpen(false)} />
    </main>
    </div>
    {detailId && bookmarks.notice && <div className="bookmark-detail-notice" role="alert">{bookmarks.notice}<button type="button" onClick={bookmarks.dismiss}>閉じる</button></div>}
    {detailId && <EventDetailPage key={navigation.entryKey}
      event={detailEvent}
      requestedId={detailId}
      saved={!!detailEvent && bookmarks.has(detailEvent.routeId ?? detailEvent.id)}
      onToggleSave={detailEvent ? () => bookmarks.toggle(detailEvent) : undefined}
      loading={!data && !error}
      loadError={error}
      now={now}
      onBack={navigation.back}
      onRetry={() => setLoadAttempt((value) => value + 1)}
      onNavigate={navigate}
      onOpenEvent={openDetail}
      nearbyOngoingEvents={detailRelated.nearbyOngoing}
      sameAreaEvents={detailRelated.sameArea}
    />}
    </>
  );
}
