import type { EventItem, UserProfile } from '../types';

const DAY_MS = 86_400_000;

function dateDistance(date: string | undefined, today: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export function recommendationScore(event: EventItem, profile: UserProfile = {}, distanceKm?: number): number {
  let score = 50;
  if (profile.favoriteCategories?.includes(event.category)) score += 25;
  if (profile.hasChildren === true && event.childFriendly === true) score += 12;
  if (profile.companion === 'partner' && event.dateFriendly === true) score += 10;
  if (event.freeEvent === true) score += 4;
  if (typeof distanceKm === 'number' && profile.maxTravelMinutes) {
    const minutes = estimateMinutes(distanceKm, profile.transport);
    score += minutes <= profile.maxTravelMinutes ? 9 : -12;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
export const calculateRecommendationScore = recommendationScore;

/** A transparent editorial score for the default event-list order. */
export function eventAttentionScore(event: EventItem, profileScore = 50, now = new Date()): number {
  let score = 0;
  const evidence = event.recommendationEvidence;
  const official = Boolean(event.officialUrl || evidence?.official || event.provenance?.some((item) => item.officialUrl));
  const featuredTags = event.tags?.filter((tag) => ['celebrity', 'limited', 'exhibition'].includes(tag)).length ?? 0;
  const title = event.eventName;
  const venue = event.venueName ?? '';
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const startInDays = dateDistance(event.startDate, today);
  const endInDays = dateDistance(event.endDate ?? event.startDate, today);
  const durationDays = startInDays !== undefined && endInDays !== undefined ? endInDays - startInDays + 1 : undefined;

  score += evidence?.scale === 'major' ? 30 : evidence?.scale === 'medium' ? 18 : evidence?.scale === 'local' ? 6 : 0;
  if (/(?:特別展|企画展|フェス(?:ティバル)?|花火大会|イルミネーション|博覧会|祭り|祭)$/.test(title)
    || (/(?:展覧会|展)$/.test(title) && /(美術館|博物館|ギャラリー|ミュージアム)/.test(venue))) score += 18;
  if (official) score += 12;
  if (event.imageUrl) score += 12;
  if (event.description) score += 6;
  if (event.venueName) score += 4;
  score += Math.min(12, featuredTags * 6);
  if (evidence?.season) score += 6;
  if (startInDays !== undefined && endInDays !== undefined && startInDays <= 0 && endInDays >= 0) score += 15;
  else if (startInDays !== undefined && startInDays <= 7) score += 12;
  else if (startInDays !== undefined && startInDays <= 30) score += 7;
  if (durationDays !== undefined && durationDays > 90) score -= 10;
  const eventText = `${event.eventName} ${event.description ?? ''}`;
  if (/(作品?募集|応募期間|フォトコンテスト|レシート.*応募|web上で|オンラインのみ)/i.test(eventText)) return 0;
  if (event.officialStatus && event.officialStatus !== 'scheduled') return 0;
  if (/(?:受注会|販売会|セール|実演販売|商品説明会)/.test(title)) score -= 30;
  score += (profileScore - 50) * 0.35;
  return Math.max(0, Math.round(score));
}

function estimateMinutes(km: number, mode?: string) { return Math.ceil(km / (mode === 'walk' ? 4.5 : mode === 'car' ? 30 : 25) * 60); }
