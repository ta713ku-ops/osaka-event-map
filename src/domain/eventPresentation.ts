import type { EventItem } from '../types';
import { occursOnDate } from './events';

const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ',
  yen: '¥', cent: '¢', pound: '£', euro: '€', copy: '©', reg: '®',
  middot: '·', times: '×', divide: '÷', ndash: '–', mdash: '—',
  hellip: '…', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

/** Decode common HTML entities into plain text without parsing or rendering markup. */
export function normalizeDisplayText(value: string): string {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/giu, (entity, token: string) => {
    if (token.startsWith('#')) {
      const hexadecimal = /^#x/i.test(token);
      const codePoint = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
      try { return String.fromCodePoint(codePoint); } catch { return entity; }
    }
    return HTML_ENTITIES[token.toLocaleLowerCase('en-US')] ?? entity;
  });
}

export type EventMediaKind = 'photo' | 'poster' | 'none';
export type EventImageDimensions = { width: number; height: number };

/** A tall image gets a portrait layout without being labeled as a poster. */
export function eventImageIsPortrait(dimensions: EventImageDimensions): boolean {
  return dimensions.width > 0 && dimensions.height > dimensions.width * 1.15;
}

/** Distinguish source-backed media using explicit poster clues, not image shape alone. */
export function eventMediaKind(
  event: Pick<EventItem, 'imageUrl' | 'imageSource'>,
  _dimensions?: EventImageDimensions,
): EventMediaKind {
  const image = usableEventImage(event);
  if (!image) return 'none';
  const sourceClues = normalizeDisplayText(event.imageSource ?? '');
  let pathClues = image;
  try { pathClues = decodeURIComponent(new URL(image).pathname); } catch { /* usableEventImage already checked the URL. */ }
  if (/(?:ポスター|チラシ|フライヤー|告知画像|バナー|poster|flyer|banner|bannner|(?:^|[/_. -])kv(?:[/_.@ -]|$)|key.?visual)/iu.test(`${sourceClues} ${pathClues}`.normalize('NFC'))) return 'poster';
  return 'photo';
}

/** A layout hint for images that may soften when enlarged in a large detail frame. */
export function isLowResolutionEventImage(dimensions: EventImageDimensions): boolean {
  return dimensions.width > 0 && dimensions.height > 0
    && Math.max(dimensions.width, dimensions.height) < 640;
}

export function cardPriceLabel(event: EventItem): string | undefined {
  if (typeof event.price === 'number') return `${event.price.toLocaleString('ja-JP')}円`;
  if (typeof event.price === 'string' && event.price.trim()) {
    const text = normalizeDisplayText(event.price).replace(/[\s\u3000]+/gu, ' ').trim();
    if (/^(?:なし|未定|未掲載|[-—])$/u.test(text)) return undefined;
    if (text.length <= 32) return text;

    const base = (text.split(/[※*\n\r。]/u, 1)[0] ?? text).replace(/^[⚫︎●・\s]+/u, '').trim();
    const conditionPatterns = [
      /(?:要(?:事前)?(?:予約|申込)|(?:事前)?(?:予約|申込)(?:必須|が必要|制)|予約必須|申込必須)/u,
      /(?:抽選|先着(?:順)?|整理券)/u,
      /(?:未就学児|幼児|[0-9０-９]+歳以下|小学生以下|中学生以下|高校生以下)[^、。，;；\n]{0,12}(?:無料|割引|同伴)/u,
      /別途[^、。，;；\n]{0,18}(?:料金|入園料|入場料|入館料|費|必要)/u,
      /保護者[^、。，;；\n]{0,12}(?:同伴|必要|必須)/u,
      /現金のみ/u,
    ];
    const conditions = conditionPatterns
      .map((pattern) => text.match(pattern)?.[0])
      .filter((condition): condition is string => Boolean(condition && !base.includes(condition)));
    // An event can be free while entry to its venue is required and paid.
    // Keep that cost visible when the first sentence only says "催事は無料".
    const admission = text.match(/(?:入園|入館|入場|観覧|鑑賞|施設利用)(?:料|料金)[^。;；\n]{0,80}/u)?.[0]
      ?.split(/[、,]/u, 1)[0]?.trim();
    if (event.freeEvent === false && /無料/u.test(base) && admission && /[1-9][\d,]*円/u.test(admission)
      && !base.includes(admission) && !conditions.includes(admission)) conditions.unshift(admission);
    const summary = base.length > 32 ? `${base.slice(0, 31).trimEnd()}…` : base;
    return [summary, ...conditions, '条件は詳細'].filter(Boolean).join('・');
  }
  return event.freeEvent === true ? '無料' : undefined;
}

const jstDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
const jstTime = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(date);

/** Returns the source-backed event image URL, or undefined for generic assets. */
export function usableEventImage(event: Pick<EventItem, 'imageUrl' | 'imageSource'>): string | undefined {
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
