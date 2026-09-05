import type { EventItem } from '../types';

export type RecommendationTier = 'large' | 'large-fallback-90d' | 'large-fallback-quality' | 'today';
export interface RecommendationCandidate {
  event: EventItem; score: number; components: Record<string, number>; reasons: string[];
  bonuses: string[]; penalties: string[]; exclusions: string[]; tier: RecommendationTier;
}
export interface HomeRecommendationResult {
  large: RecommendationCandidate[]; today: RecommendationCandidate[];
  diagnostics: { large: RecommendationCandidate[]; today: RecommendationCandidate[] };
}

const DAY_MS = 86_400_000;
const LARGE_VENUE_SOURCES = new Set([
  'festival-hall', 'zepp-namba', 'ghibli-park-exhibition-osaka',
]);
const SINGLE_FACILITY_SOURCES = /^(aeon-|hankyu-|festival-hall|zepp-namba|nakka-art-museum|osaka-art-museum|ghibli-park-exhibition-osaka|atc-events)/;

const jstDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function dateRange(event: EventItem) {
  const start = event.startDate, end = event.endDate ?? start;
  if (!validDate(start) || !validDate(end) || end < start) return undefined;
  return { start, end, durationDays: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1 };
}
const daysFrom = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
const officialInformation = (event: EventItem) =>
  Boolean(event.officialUrl || event.recommendationEvidence?.official || event.provenance?.some(item => item.officialUrl));
function normalizedImage(event: EventItem) {
  if (!event.imageUrl) return '';
  try { const url = new URL(event.imageUrl); url.search = ''; url.hash = ''; return url.toString().toLowerCase(); }
  catch { return event.imageUrl.split(/[?#]/, 1)[0].toLowerCase(); }
}
function normalizedVenue(event: EventItem) {
  if (event.sourceId && SINGLE_FACILITY_SOURCES.test(event.sourceId)) return event.sourceId;
  return (event.venueName ?? '').normalize('NFKC').toLocaleLowerCase('ja-JP')
    .replace(/[\s　]+/g, '').replace(/(?:第?\d+|[一二三四五六七八九十]+)?(?:階|f).*/i, '');
}
const normalizedEvent = (event: EventItem) =>
  `${event.eventName.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s　\p{P}\p{S}]+/gu, '')}|${normalizedVenue(event)}`;
const eventText = (event: EventItem) => `${event.eventName} ${event.description ?? ''}`;
function commonExclusions(event: EventItem, today: string) {
  const exclusions: string[] = [], range = dateRange(event), text = eventText(event);
  if (!range) exclusions.push('開催日が不正または不明確');
  else if (range.end < today) exclusions.push('開催終了');
  if (/(中止|開催中止|延期|受付終了|販売終了)/.test(text)) exclusions.push('中止・終了情報あり');
  if (/(作品?募集|応募期間|フォトコンテスト|レシート.*応募|web上で.*展示|オンラインのみ)/i.test(text))
    exclusions.push('現地で参加する催しと確認できない');
  return exclusions;
}
function largeSignals(event: EventItem) {
  const title = event.eventName, venue = event.venueName ?? '';
  const largeVenue = Boolean(event.sourceId && LARGE_VENUE_SOURCES.has(event.sourceId));
  const museumExhibition = /(?:特別展|企画展)/.test(title)
    || (/(?:展覧会|展)$/.test(title) && /(美術館|博物館|ギャラリー|ミュージアム)/.test(venue));
  const publicFeature = /(?:フェス(?:ティバル)?|花火大会|イルミネーション|博覧会|祭り|祭)$/.test(title)
    && !/(イオンモール|百貨店|店|売場)/.test(venue);
  return { largeVenue, museumExhibition, publicFeature, evidencedScale: event.recommendationEvidence?.scale };
}
function scoreLarge(event: EventItem, today: string, windowDays: number, tier: RecommendationTier, qualityFallback = false) {
  const candidate: RecommendationCandidate = {
    event, score: 0, components: {}, reasons: [], bonuses: [], penalties: [],
    exclusions: commonExclusions(event, today), tier,
  };
  const range = dateRange(event), text = eventText(event), signals = largeSignals(event);
  if (range && daysFrom(range.start, today) > windowDays) candidate.exclusions.push(`${windowDays}日以内ではない`);
  if (!officialInformation(event) || !event.venueName) candidate.exclusions.push('公式情報または会場情報が不足');
  if (/(ワークショップ|体験教室|相談会|販売会|実演販売|キャンペーン|デモンストレーション)/.test(text))
    candidate.exclusions.push('小規模・募集型の可能性が高い');
  if (/(常設展|コレクション展|収蔵品展)/.test(text)) candidate.exclusions.push('常設・収蔵展示');
  if (!qualityFallback && !signals.largeVenue && !signals.museumExhibition && !signals.publicFeature && !signals.evidencedScale)
    candidate.exclusions.push('大型イベントの明示的な根拠が不足');
  if (qualityFallback && !signals.largeVenue) candidate.exclusions.push('大型会場の根拠が不足');
  if (candidate.exclusions.length || !range) return candidate;

  const scale = signals.evidencedScale === 'major' ? 30 : signals.largeVenue ? 27 : signals.museumExhibition ? 25 : 22;
  const timing = range.start <= today && today <= range.end
    ? (daysFrom(range.end, today) <= 7 ? 15 : 11) : (daysFrom(range.start, today) <= 7 ? 15 : 8);
  const information = (officialInformation(event) ? 8 : 0) + (event.description ? 4 : 0) + (event.venueName ? 3 : 0);
  const topic = event.tags?.some(tag => ['celebrity', 'limited', 'exhibition'].includes(tag)) ? 10 : 0;
  candidate.components = { scale, timing, information, topic, visual: event.imageUrl ? 8 : 0, season: event.recommendationEvidence?.season ? 5 : 0 };
  candidate.score = Math.min(100, Object.values(candidate.components).reduce((sum, value) => sum + value, 0));
  candidate.reasons.push(signals.largeVenue ? '大型会場の公式催事' : signals.museumExhibition ? '美術館・博物館の注目展' : '季節を代表する催し');
  candidate.reasons.push(range.start <= today ? '現在開催中' : '近日開催');
  if (event.imageUrl) candidate.bonuses.push('公式画像あり');
  if (topic) candidate.bonuses.push('公式タグによる特集性');
  if (range.durationDays > 90) {
    candidate.score -= 12; candidate.components.duration = -12; candidate.penalties.push('長期開催');
  }
  return candidate;
}
const scheduleVerified = (event: EventItem) => Boolean(event.schedule?.evidence || event.recommendationEvidence?.verified);
function isTodayScheduled(event: EventItem, today: string) {
  const schedule = event.schedule;
  if (!schedule || !scheduleVerified(event)) return undefined;
  if (schedule.closedDates?.includes(today)) return false;
  if (schedule.dates) return schedule.dates.includes(today);
  if (schedule.weekdays) return schedule.weekdays.includes(new Date(`${today}T00:00:00Z`).getUTCDay());
  if (schedule.daily) return true;
  return undefined;
}
function scoreToday(event: EventItem, today: string, now: Date) {
  const candidate: RecommendationCandidate = {
    event, score: 0, components: {}, reasons: [], bonuses: [], penalties: [],
    exclusions: commonExclusions(event, today), tier: 'today',
  };
  const range = dateRange(event), scheduled = isTodayScheduled(event, today);
  if (!range || today < range.start || today > range.end) candidate.exclusions.push('本日開催ではない');
  if (scheduled === false) candidate.exclusions.push('本日は開催日ではない');
  const recurringText = /(毎週|毎月|全\d+回|年間|通年|教室|講座)/.test(eventText(event));
  if (range && range.durationDays > 1 && scheduled === undefined && (!event.startTime || recurringText))
    candidate.exclusions.push('本日の実施を確認できない');
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  if (event.endTime && event.endTime.slice(0, 5) <= localTime) candidate.exclusions.push('本日の終了時刻を過ぎた');
  const endAt = event.endAt ? new Date(event.endAt) : undefined;
  if (endAt && Number.isFinite(endAt.getTime()) && jstDate(endAt) === today) {
    const endAtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(endAt);
    if (endAtTime <= localTime) candidate.exclusions.push('本日の終了時刻を過ぎた');
  }
  if (candidate.exclusions.length) return candidate;

  const publishedHours = Boolean(event.startTime || event.endTime || event.startAt || event.endAt || event.recommendationEvidence?.publishedHours);
  const priceKnown = (event.price !== undefined && event.price !== null) || (event.freeEvent !== undefined && event.freeEvent !== null);
  const convenience = (publishedHours ? 16 : 0) + (event.address || event.venueName ? 8 : 0) + (priceKnown ? 6 : 0);
  const information = (officialInformation(event) ? 15 : 0) + (event.description ? 6 : 0) + (event.officialUrl ? 4 : 0);
  const urgency = range?.durationDays === 1 ? 10 : range && daysFrom(range.end, today) <= 7 ? 6 : 0;
  candidate.components = { today: 25, urgency, convenience, information, audience: event.childFriendly || event.dateFriendly ? 10 : 0, visual: event.imageUrl ? 10 : 0 };
  candidate.score = Math.min(100, Object.values(candidate.components).reduce((sum, value) => sum + value, 0));
  candidate.reasons.push('本日開催を日付情報で確認');
  if (publishedHours) candidate.reasons.push('開催時間を確認');
  if (range?.durationDays === 1) candidate.bonuses.push('本日限り');
  else if (urgency) candidate.bonuses.push('終了間近');
  if (range && range.durationDays > 90) {
    candidate.score -= 12; candidate.components.duration = -12; candidate.penalties.push('長期開催');
  }
  if (event.childFriendly) candidate.bonuses.push('家族向け情報あり');
  if (!event.imageUrl) candidate.penalties.push('画像情報なし');
  return candidate;
}
function selectDiverse(candidates: RecommendationCandidate[], limit: number) {
  const tierPriority: Record<RecommendationTier, number> = {
    large: 0, 'large-fallback-90d': 1, 'large-fallback-quality': 2, today: 0,
  };
  const sorted = candidates.filter(item => item.exclusions.length === 0)
    .sort((a, b) => tierPriority[a.tier] - tierPriority[b.tier] || b.score - a.score || a.event.id.localeCompare(b.event.id));
  const selected: RecommendationCandidate[] = [], eventKeys = new Set<string>(), images = new Set<string>();
  const venues = new Map<string, number>(), categories = new Map<string, number>();
  let longDurationCount = 0;
  for (const maxVenue of [1, 2]) {
    for (const candidate of sorted) {
      if (selected.includes(candidate)) continue;
      const eventKey = normalizedEvent(candidate.event), imageKey = normalizedImage(candidate.event);
      const venueKey = normalizedVenue(candidate.event), duration = dateRange(candidate.event)?.durationDays ?? 0;
      const blocked = eventKeys.has(eventKey) || Boolean(imageKey && images.has(imageKey))
        || Boolean(venueKey && (venues.get(venueKey) ?? 0) >= maxVenue)
        || (categories.get(candidate.event.category) ?? 0) >= (maxVenue === 1 ? 2 : 3)
        || (duration > 90 && longDurationCount >= 1);
      if (blocked) continue;
      selected.push(candidate); eventKeys.add(eventKey);
      if (imageKey) images.add(imageKey);
      if (venueKey) venues.set(venueKey, (venues.get(venueKey) ?? 0) + 1);
      categories.set(candidate.event.category, (categories.get(candidate.event.category) ?? 0) + 1);
      if (duration > 90) longDurationCount += 1;
      if (selected.length >= limit) break;
    }
    if (selected.length >= limit) break;
  }
  for (const candidate of sorted) if (!selected.includes(candidate))
    candidate.exclusions.push('会場・画像・カテゴリ・長期開催の多様性制約で非選択');
  return selected;
}
export function recommendHomeEvents(events: EventItem[], now = new Date(), options: { largeLimit?: number; todayLimit?: number } = {}): HomeRecommendationResult {
  const today = jstDate(now), largeLimit = options.largeLimit ?? 4, todayLimit = options.todayLimit ?? 6;
  const diagnosticsLarge = events.map(event => scoreLarge(event, today, 30, 'large'));
  const largePool = diagnosticsLarge.map((strict, index) => {
    if (!strict.exclusions.length) return strict;
    const ninetyDay = scoreLarge(events[index], today, 90, 'large-fallback-90d');
    if (!ninetyDay.exclusions.length) return ninetyDay;
    return scoreLarge(events[index], today, 30, 'large-fallback-quality', true);
  });
  const selectedLarge = selectDiverse(largePool, largeLimit);
  const used = new Set(selectedLarge.map(item => item.event.id));
  const diagnosticsToday = events.map(event => {
    const candidate = scoreToday(event, today, now);
    if (used.has(event.id)) candidate.exclusions.push('大型イベント枠と重複');
    return candidate;
  });
  return { large: selectedLarge, today: selectDiverse(diagnosticsToday, todayLimit), diagnostics: { large: diagnosticsLarge, today: diagnosticsToday } };
}
