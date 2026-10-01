import type { EventItem } from '../types';
import { occursOnDate } from './events';

const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;

export function cardPriceLabel(event: EventItem): string | undefined {
  if (typeof event.price === 'number') return `${event.price.toLocaleString('ja-JP')}円`;
  if (typeof event.price === 'string' && event.price.trim()) {
    const text = event.price.trim();
    if (text.length <= 80) return text;
    const prefix = text.split(/[*※]/u)[0].trim();
    return `${prefix.slice(0, 70)}${prefix.length > 70 ? '…' : ''}（条件は詳細）`;
  }
  return event.freeEvent === true ? '無料（条件は詳細で確認）' : undefined;
}

const jstDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
const jstTime = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(date);

/** Returns the source-backed event image URL, or undefined for generic assets. */
export function usableEventImage(event: EventItem): string | undefined {
  const value = event.imageUrl?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined;

  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const fileName = path.split('/').filter(Boolean).at(-1)?.toLocaleLowerCase('en-US') ?? '';
  const genericAsset = /^(?:no[-_ ]?(?:image|photo)|dummy|placeholder|fallback|blank|favicon|icon|(?:site|venue|facility|brand)[-_]?logo)(?:[._-]|$)/i;
  if (genericAsset.test(fileName) || /(?:^|[-_])no[-_]?(?:img|image|photo)(?:[._-]|$)/i.test(fileName)) return undefined;
  if (/(?:会場|施設|サイト|ブランド)(?:の)?(?:ロゴ|代替画像)|(?:汎用|プレースホルダー)(?:画像)?/u.test(event.imageSource ?? '')) return undefined;
  return url.href;
}

/** A recent official confirmation requires both a successful source fetch and
 * a valid event-level check timestamp no more than 48 hours old. */
export function eventFreshness(event: EventItem, now = new Date()): boolean {
  if (event.sourceStatus !== 'success' || !event.lastCheckedAt) return false;
  const checkedAt = Date.parse(event.lastCheckedAt);
  const nowTime = now.getTime();
  return Number.isFinite(checkedAt) && Number.isFinite(nowTime)
    && checkedAt <= nowTime && nowTime - checkedAt <= FRESHNESS_WINDOW_MS;
}

function freshnessLabel(event: EventItem, label: string, now: Date) {
  return eventFreshness(event, now) ? label : ['本日開催', '本日開催予定', '開催期間中', '本日終了', '本日休催', '本日開催なし'].includes(label) ? '掲載日程・最新状況は公式確認' : `${label}（最新状況は公式確認）`;
}

function validTime(value?: string) {
  if (!value) return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function explicitStatus(event: EventItem) {
  switch (event.officialStatus) {
    case 'cancelled': return '中止';
    case 'postponed': return '延期';
    case 'sold_out': return '完売';
    case 'registration_closed': return '受付終了';
    default: return undefined;
  }
}

/** A cautious human-readable state for cards and event details. Date-only
 * ranges are described as periods; "開催中" needs fresh confirmation and a
 * positive occurrence for the current Osaka date. */
export function eventStatusLabel(event: EventItem, now = new Date()): string {
  const today = jstDate(now);
  const explicit = explicitStatus(event);
  if (explicit) return freshnessLabel(event, explicit, now);

  const start = event.startDate;
  const end = event.endDate ?? start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return '日程未確認';
  }
  if (end < today) return freshnessLabel(event, '終了', now);
  if (start > today) return freshnessLabel(event, '開催予定', now);
  if (!occursOnDate(event, today)) {
    const isClosed = Boolean(event.schedule?.evidence || event.recommendationEvidence?.verified)
      && event.schedule?.closedDates?.includes(today);
    return freshnessLabel(event, isClosed ? '本日休催' : '本日開催なし', now);
  }

  const startTime = validTime(event.startTime);
  const endTime = validTime(event.endTime);
  if (startTime && endTime) {
    const currentTime = jstTime(now);
    const wraps = endTime < startTime;
    if (!wraps && currentTime < startTime) return freshnessLabel(event, '本日開催予定', now);
    if (!wraps && currentTime > endTime) return freshnessLabel(event, '本日終了', now);
    if (wraps && currentTime < startTime) return freshnessLabel(event, '本日開催予定', now);
    if (eventFreshness(event, now) && (start === end || Boolean(event.schedule?.evidence))) return '開催中';
  }
  return freshnessLabel(event, start === end ? '本日開催' : '開催期間中', now);
}
