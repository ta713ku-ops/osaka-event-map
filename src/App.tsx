import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { DiscoveryHeader } from './components/DiscoveryHeader';
import { DiscoveryIntro } from './components/DiscoveryIntro';
import { EventMap } from './components/EventMap';
import { EventSheet, type EventSheetEvent } from './components/EventSheet';
import { FilterSheet, type EventFilters } from './components/FilterSheet';
import { ProfileDialog, type Profile } from './components/ProfileDialog';
import { HomeDiscovery, type HomeEvent } from './components/HomeDiscovery';
import {
  appleMapsUrl,
  calculateDistanceKm,
  calculateRecommendationScore,
  estimateTravelTimeMinutes,
  filterEvents,
  googleMapsUrl,
  isOngoing,
} from './domain';
import type { Coordinates, EventItem, TimeFilter, UserProfile } from './types';

type DataFile = {
  generatedAt: string;
  attribution: { name: string; license: string; sourceUrl: string };
  events: EventItem[];
};

type RankedEvent = EventItem & {
  distanceKm: number;
  travelMinutes: number;
  recommendation: number;
  recommendationReasons: string[];
};

const OSAKA_STATION: Coordinates = { latitude: 34.7025, longitude: 135.4959 };
const STORAGE_KEY = 'dokoiko-osaka-profile-v1';
const TIME_FILTERS: { key: TimeFilter; label: string; accent?: boolean }[] = [
  { key: 'all', label: 'これから' },
  { key: 'today', label: '今日' },
  { key: 'tonight', label: '今夜', accent: true },
  { key: 'tomorrow', label: '明日' },
  { key: 'weekend', label: '今週末' },
];

const CATEGORY_LABELS: Record<string, string> = {
  festival: '祭り・フェス', fireworks: '花火', shopping: 'ショッピング', zoo: 'いきもの',
  aquarium: '水族館', amusement: '遊園地', themePark: 'テーマパーク', food: 'グルメ',
  market: 'マルシェ', fleaMarket: 'フリーマーケット', exhibition: '展覧会', museum: '博物館',
  workshop: '体験・教室', seasonal: '季節イベント', illumination: 'イルミネーション', night: '夜イベント',
};

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

function recommendationReasons(event: EventItem, profile: UserProfile, distanceKm: number, now: Date) {
  const reasons: string[] = [];
  if (isOngoing(event, now)) reasons.push('開催期間中（開催日時は公式確認）');
  if (profile.favoriteCategories?.includes(event.category)) reasons.push('好きなジャンル');
  if (profile.hasChildren && event.childFriendly) reasons.push('子どもと楽しめる');
  if (profile.companion === 'partner' && event.dateFriendly) reasons.push('ふたりのお出かけ向き');
  if (event.freeEvent) reasons.push('無料');
  if (distanceKm < 10) reasons.push('近くて行きやすい');
  return reasons.slice(0, 2);
}

function timeLabel(event: EventItem) {
  const formatter = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
  const start = new Date(`${event.startDate}T00:00:00+09:00`);
  const date = formatter.format(start);
  const time = event.startTime ? ` ${event.startTime.slice(0, 5)}` : '';
  const end = event.endDate && event.endDate !== event.startDate
    ? `〜${new Intl.DateTimeFormat('ja-JP', { year: event.endDate.slice(0, 4) !== event.startDate.slice(0, 4) ? 'numeric' : undefined, month: 'numeric', day: 'numeric' }).format(new Date(`${event.endDate}T00:00:00+09:00`))}`
    : '';
  return `${date}${end}${time}`;
}

export function App() {
  const [view, setView] = useState<'home' | 'map'>('home');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [locationNotice, setLocationNotice] = useState('');
  const [data, setData] = useState<DataFile | null>(null);
  const [error, setError] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<EventFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(() => readProfile());
  const [filterOpen, setFilterOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [origin, setOrigin] = useState<Coordinates>(OSAKA_STATION);
  const [originLabel, setOriginLabel] = useState('大阪駅から');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`${import.meta.env.BASE_URL}data/events.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<DataFile>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== 'AbortError') setError('イベント情報を読み込めませんでした。通信を確認して再読み込みしてください。');
      });
    return () => controller.abort();
  }, [loadAttempt]);

  const now = useMemo(() => new Date(), [data, timeFilter, filters]);
  const userProfile = useMemo(() => domainProfile(profile), [profile]);
  const ranked = useMemo<RankedEvent[]>(() => {
    if (!data) return [];
    const normalizedQuery = query.normalize('NFKC').trim().toLocaleLowerCase('ja');
    return filterEvents(data.events, timeFilter, now)
      .map((event) => {
        const distanceKm = calculateDistanceKm(origin, { latitude: Number(event.latitude), longitude: Number(event.longitude) });
        const travelMinutes = estimateTravelTimeMinutes(distanceKm, userProfile.transport ?? 'train');
        return {
          ...event,
          distanceKm,
          travelMinutes,
          recommendation: calculateRecommendationScore(event, userProfile, distanceKm),
          recommendationReasons: recommendationReasons(event, userProfile, distanceKm, now),
        };
      })
      .filter((event) => {
        if (normalizedQuery) {
          const searchable = [event.eventName, event.venueName, event.address, CATEGORY_LABELS[event.category]]
            .filter(Boolean)
            .join(' ')
            .normalize('NFKC')
            .toLocaleLowerCase('ja');
          if (!searchable.includes(normalizedQuery)) return false;
        }
        if (filters.withinMinutes && event.travelMinutes > filters.withinMinutes) return false;
        if (filters.free && event.freeEvent !== true) return false;
        if (filters.rainOk && event.rainSupport !== true && event.indoor !== true) return false;
        if (filters.family && event.childFriendly !== true) return false;
        if (filters.date && event.dateFriendly !== true) return false;
        if (filters.night && !['night', 'illumination', 'fireworks'].includes(event.category)) return false;
        if (filters.categories?.length && !filters.categories.includes(event.category)) return false;
        return true;
      })
      .sort((a, b) => Number(isOngoing(b, now)) - Number(isOngoing(a, now)) || b.recommendation - a.recommendation || a.distanceKm - b.distanceKm);
  }, [data, filters, now, origin, query, timeFilter, userProfile]);

  const selected = ranked.find((event) => event.id === selectedId) ?? null;
  const selectedSheet = selected ? {
    ...selected,
    ongoing: isOngoing(selected, now),
    address: selected.address === selected.venueName ? undefined : selected.address,
  } : null;
  const liveCount = ranked.filter((event) => isOngoing(event, now)).length;
  const mapEvents = ranked.map((event, index) => ({
    ...event,
    latitude: Number(event.latitude),
    longitude: Number(event.longitude),
    displayLabel: index < 4,
  }));
  const activeFilterCount = Object.values(filters).filter((value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false).length;
  const homeEvents = useMemo<HomeEvent[]>(() => ranked.slice(0, 40).map((event) => ({
    id: event.id,
    eventName: event.eventName,
    categoryLabel: CATEGORY_LABELS[event.category] ?? 'イベント',
    venueName: event.venueName,
    timeLabel: timeLabel(event),
    travelMinutes: event.travelMinutes,
    recommendation: event.recommendation,
    ongoing: isOngoing(event, now),
    description: event.description,
    imageUrl: typeof event.imageUrl === 'string' && event.imageUrl.startsWith('https://') ? event.imageUrl : undefined,
    imageSourceUrl: typeof event.imageSourceUrl === 'string' && event.imageSourceUrl.startsWith('https://') ? event.imageSourceUrl : undefined,
  })), [now, ranked]);

  const selectEvent = (event: { id: string } | null) => setSelectedId(event?.id ?? null);
  const saveProfile = (next: Profile) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  };
  const locate = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationNotice('このローカル接続では現在地を利用できません。大阪駅を起点に表示しています。');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setOrigin({ latitude: coords.latitude, longitude: coords.longitude });
      setOriginLabel('現在地から');
      setLocationNotice('');
    }, () => setLocationNotice('現在地を取得できませんでした。位置情報の許可を確認してください。'), { timeout: 10000 });
  };
  const navigate = (provider: 'apple' | 'google') => {
    if (!selected) return;
    window.open(provider === 'apple' ? appleMapsUrl(selected) : googleMapsUrl(selected), '_blank', 'noopener,noreferrer');
  };

  return (
    <main className={`app-shell ${view === 'map' ? 'is-map' : 'is-home'}`}>
      <a className="skip-link" href={view === 'home' ? '#home-results' : '#event-results'}>候補へ移動</a>
      <DiscoveryHeader
        liveCount={liveCount}
        originLabel={originLabel}
        onLocate={locate}
        onOpenProfile={() => setProfileOpen(true)}
        view={view}
        onShowHome={() => setView('home')}
        onShowMap={() => setView('map')}
      />
      {locationNotice && <div className="location-notice" role="status">{locationNotice}<button type="button" onClick={() => setLocationNotice('')}>閉じる</button></div>}
      {view === 'home' ? <HomeDiscovery
        events={homeEvents}
        totalCount={ranked.length}
        liveCount={liveCount}
        query={query}
        onQueryChange={setQuery}
        timeFilter={timeFilter}
        timeFilters={TIME_FILTERS}
        onTimeFilterChange={(key) => { setTimeFilter(key as TimeFilter); setSelectedId(null); }}
        onShowMap={() => setView('map')}
        onSelectEvent={setSelectedId}
        onOpenFilters={() => setFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        loading={!data && !error}
        error={error}
        onReset={() => { setQuery(''); setTimeFilter('all'); setFilters({}); setLoadAttempt((value) => value + 1); }}
      /> : <>
      <section className="time-toolbar" aria-label="開催日の絞り込み">
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
              onClick={() => { setTimeFilter(item.key); setSelectedId(null); }}
            >
              {item.accent && <Sparkles size={15} aria-hidden="true" />}{item.label}
            </button>
          ))}
        </div>
        <button type="button" className="filter-button" onClick={() => setFilterOpen(true)} aria-label={`条件を追加${activeFilterCount ? `、${activeFilterCount}件適用中` : ''}`}>
          <SlidersHorizontal size={18} /><span>条件</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        </button>
      </section>

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
            {ranked.slice(0, 20).map((event, index) => (
              <button key={event.id} type="button" className={`event-row ${selectedId === event.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(event.id)}>
                <span className={`rank-badge ${isOngoing(event, now) ? 'is-live' : ''}`}>{isOngoing(event, now) ? '開催中' : index + 1}</span>
                <span className="event-row-copy">
                  <span className="event-row-top"><b>{CATEGORY_LABELS[event.category] ?? 'イベント'}</b><em>おすすめ {event.recommendation}%</em></span>
                  <strong>{event.eventName}</strong>
                  <span>{timeLabel(event)} ・ 約{event.travelMinutes}分 ・ {event.freeEvent ? '無料' : event.price || '料金は公式確認'}</span>
                </span>
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            ))}
          </div>
          {data && <p className="data-note">大阪府オープンデータ（CC BY 4.0）を利用。内容は参加前に公式サイトで確認してください。</p>}
        </aside>

        <section className="map-panel" aria-label="大阪府イベントマップ">
          <EventMap events={mapEvents} selectedEventId={selectedId} onEventSelect={selectEvent} />
          <div className="map-summary" aria-live="polite">
            <span><i className="live-indicator" />{liveCount}件が開催中</span>
            <strong><small>{originLabel}</small>今日は、どこへ行く？</strong>
          </div>
          {!selected && ranked.length > 0 && (
            <div className="discovery-rail" role="region" aria-label="おすすめ候補">
            <div className="rail-title"><span>今から出会う、大阪</span><b>横にスワイプ</b></div>
              <div className="rail-cards">
                {ranked.slice(0, 12).map((event) => (
                  <button key={event.id} type="button" onClick={() => setSelectedId(event.id)}>
                    <span>{isOngoing(event, now) ? '開催中' : timeLabel(event)} ・ {CATEGORY_LABELS[event.category] ?? 'イベント'}</span>
                    <strong>{event.eventName}</strong>
                    <small>約{event.travelMinutes}分　おすすめ {event.recommendation}%</small>
                  </button>
                ))}
              </div>
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
      {(selectedSheet || filterOpen || profileOpen) && <div className="modal-scrim" aria-hidden="true" />}
      <EventSheet event={selectedSheet as EventSheetEvent | null} onClose={() => setSelectedId(null)} onNavigate={navigate} />
      <FilterSheet
        open={filterOpen}
        value={filters}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        categories={Object.keys(CATEGORY_LABELS)}
      />
      <ProfileDialog open={profileOpen} value={profile} onChange={setProfile} onSave={saveProfile} onClose={() => setProfileOpen(false)} />
    </main>
  );
}
