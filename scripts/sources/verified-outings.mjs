import { readFileSync } from 'node:fs';
import { eventCategory, httpUrl, normalize, normalizeEventRecord, normalizeDate, validDateRange } from '../lib/events.mjs';

const OSAKA_TIME_ZONE = 'Asia/Tokyo';
const REQUIRED_EVIDENCE_FIELDS = Object.freeze(['eventName', 'dateRange', 'venueName', 'osakaLocation', 'description']);
const DATA_URL = new URL('../../data/verified-outings.json', import.meta.url);
const DATA = JSON.parse(readFileSync(DATA_URL, 'utf8'));
const CITYSUP_PAGE = 'https://www.citysup.jp/walkable_26/';
const CITYSUP_CALENDAR = 'https://citysup.urkt.in/api/direct/courses/21947/calendars';
const SCRAP_TICKET_PAGE = 'https://scrapticket.jp/events/?content_code=20jikken&shop_id=95';
const SCRAP_TOKEN_URL = 'https://scrapticket.jp/ajax/events_calendar/csrf_token';
const SCRAP_MONTH_URL = 'https://scrapticket.jp/ajax/events_calendar/month_summary';

function decodeEntities(value = '') {
  const named = {
    amp: '&', apos: "'", copy: '©', gt: '>', hellip: '…', ldquo: '“', lt: '<',
    mdash: '—', nbsp: ' ', ndash: '–', quot: '"', reg: '®', rdquo: '”', thinsp: '\u2009',
  };
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code) => {
    if (code[0] === '#') {
      const number = code[1]?.toLocaleLowerCase('en-US') === 'x'
        ? Number.parseInt(code.slice(2), 16)
        : Number(code.slice(1));
      try { return String.fromCodePoint(number); } catch { return entity; }
    }
    return named[code.toLocaleLowerCase('en-US')] ?? entity;
  });
}

/** Remove markup and normalize visible text for conservative evidence matching. */
export function visibleText(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
    .replace(/<br\s*\/?>/giu, ' ')
    .replace(/<[^>]*>/gu, ' '))
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeEvidenceText(value) {
  return decodeEntities(String(value ?? ''))
    .normalize('NFKC')
    .replace(/[\s\u200b-\u200d\ufeff]+/gu, '')
    .toLocaleLowerCase('ja-JP');
}

/** Stable identity for duplicate checks and fixture comparisons. */
export function occurrenceIdentityKey(occurrence) {
  if (!occurrence || typeof occurrence !== 'object') return '';
  const eventName = normalize(occurrence.eventName);
  const startDate = normalizeDate(occurrence.startDate);
  const venueName = normalize(occurrence.venueName);
  if (!eventName || !startDate || !venueName) return '';
  return [eventName, startDate, normalize(occurrence.endDate || occurrence.startDate), venueName].join('|');
}

function assertDataset(occurrences) {
  if (!Array.isArray(occurrences)) throw new TypeError('verified outings data must contain an occurrences array');
  const ids = new Set();
  const identities = new Set();
  for (const occurrence of occurrences) {
    const range = validDateRange(occurrence?.startDate, occurrence?.endDate);
    if (!occurrence || typeof occurrence !== 'object'
      || !String(occurrence.sourceId ?? '').trim()
      || !String(occurrence.sourceName ?? '').trim()
      || !String(occurrence.eventName ?? '').trim()
      || !String(occurrence.venueName ?? '').trim()
      || !String(occurrence.description ?? '').trim()
      || !range
      || !Number.isFinite(new Date(occurrence.lastCheckedAt).getTime())
      || !httpUrl(occurrence.officialUrl)) {
      throw new TypeError(`invalid verified occurrence: ${occurrence?.sourceId ?? '(missing sourceId)'}`);
    }
    if (ids.has(occurrence.sourceId)) throw new Error(`duplicate verified sourceId: ${occurrence.sourceId}`);
    ids.add(occurrence.sourceId);
    const identity = occurrenceIdentityKey(occurrence);
    if (!identity || identities.has(identity)) throw new Error(`duplicate or invalid verified occurrence identity: ${occurrence.eventName}`);
    identities.add(identity);
    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      const evidence = occurrence.fieldEvidence?.[field];
      if (!evidence || !httpUrl(evidence.sourceUrl) || !String(evidence.text ?? '').trim()
        || !Number.isFinite(new Date(evidence.checkedAt).getTime())) {
        throw new TypeError(`missing ${field} evidence for ${occurrence.sourceId}`);
      }
    }
    if (occurrence.address) {
      const addressEvidence = occurrence.fieldEvidence?.address;
      if (!httpUrl(addressEvidence?.sourceUrl) || !String(addressEvidence?.text ?? '').trim()
        || !Number.isFinite(new Date(addressEvidence?.checkedAt).getTime())) {
        throw new TypeError(`missing address evidence for ${occurrence.sourceId}`);
      }
    }
    if (occurrence.fieldEvidence.eventName.sourceUrl !== occurrence.officialUrl) {
      throw new TypeError(`event name evidence must come from officialUrl for ${occurrence.sourceId}`);
    }
  }
  return occurrences;
}

assertDataset(DATA.occurrences);

function getPage(pages, url) {
  return pages instanceof Map ? pages.get(url) : pages?.[url];
}

/** Check each stored field against the official page named by its evidence. */
export function validateOccurrenceEvidence(pages, occurrence) {
  const missing = [];
  for (const field of Object.keys(occurrence?.fieldEvidence ?? {})) {
    const evidence = occurrence?.fieldEvidence?.[field];
    const page = evidence ? getPage(pages, evidence.sourceUrl) : undefined;
    const pageText = normalizeEvidenceText(visibleText(page));
    const evidenceText = normalizeEvidenceText(evidence?.text);
    if (!pageText || !evidenceText || !pageText.includes(evidenceText)) missing.push(field);
  }
  return { valid: missing.length === 0, missing };
}

function validNow(now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('now must be a valid Date');
  return date;
}

function osakaDate(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSAKA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(validNow(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCurrent(occurrence, now) {
  return occurrence.endDate >= osakaDate(now);
}

function operationCheckedAt(context) {
  const given = context?.checkedAt;
  if (given && Number.isFinite(new Date(given).getTime())) return new Date(given).toISOString();
  return validNow(context?.now).toISOString();
}

function buildEvent(occurrence, { checkedAt, stale = false }) {
  const fieldEvidence = Object.fromEntries(Object.keys(occurrence.fieldEvidence).map((field) => {
    const stored = occurrence.fieldEvidence[field];
    return [field, {
      text: stored.text,
      sourceUrl: stored.sourceUrl,
      checkedAt: stale ? stored.checkedAt : checkedAt,
    }];
  }));
  return normalizeEventRecord({
    eventName: occurrence.eventName,
    venueName: occurrence.venueName,
    description: occurrence.description,
    ...(occurrence.address ? { address: occurrence.address } : {}),
    ...Object.fromEntries(['price', 'timeInfo', 'reservationInfo', 'reservationRequired', 'accessByTransit', 'rainPolicy', 'parkingInfo']
      .filter((field) => occurrence[field] !== undefined)
      .map((field) => [field, occurrence[field]])),
    category: eventCategory(occurrence.eventName, occurrence.description),
    startDate: occurrence.startDate,
    endDate: occurrence.endDate,
    officialUrl: occurrence.officialUrl,
    sourceUrl: occurrence.officialUrl,
    source: occurrence.sourceName,
    sourceId: occurrence.sourceId,
    fieldEvidence,
    evidence: {
      date: occurrence.fieldEvidence.dateRange.text,
      venue: occurrence.fieldEvidence.venueName.text,
      url: occurrence.officialUrl,
    },
    ...(stale ? { lastCheckedAt: occurrence.lastCheckedAt } : {}),
  }, {
    sourceId: occurrence.sourceId,
    sourceName: occurrence.sourceName,
    sourceUrl: occurrence.officialUrl,
    checkedAt: stale ? occurrence.lastCheckedAt : checkedAt,
    sourceStatus: stale ? 'stale' : 'success',
  });
}

async function collectOccurrence(context, occurrence) {
  if (typeof context?.fetchText !== 'function') throw new TypeError('verified outings source requires fetchText(url)');
  const now = validNow(context.now);
  if (!isCurrent(occurrence, now)) return { events: [], errors: [], recognized: true, allowCachedFallback: false };

  const urls = [...new Set([
    occurrence.officialUrl,
    ...REQUIRED_EVIDENCE_FIELDS.map((field) => occurrence.fieldEvidence[field].sourceUrl),
    ...(occurrence.address ? [occurrence.fieldEvidence.address.sourceUrl] : []),
  ])];
  const pages = new Map();
  try {
    for (const url of urls) pages.set(url, await context.fetchText(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const age = now.getTime() - new Date(occurrence.lastCheckedAt).getTime();
    return {
      events: age >= 0 && age <= 14 * 86400000 ? [buildEvent(occurrence, { checkedAt: occurrence.lastCheckedAt, stale: true })] : [],
      errors: [`official page fetch failed; retaining last verified timestamp: ${message}`],
      recognized: true,
    };
  }

  const validation = validateOccurrenceEvidence(pages, occurrence);
  if (!validation.valid) {
    return {
      events: [],
      errors: [`official page no longer contains verified fields: ${validation.missing.join(', ')}`],
      recognized: false,
      allowCachedFallback: false,
    };
  }

  return {
    events: [buildEvent(occurrence, { checkedAt: operationCheckedAt(context) })],
    errors: [],
    recognized: true,
  };
}

/** A dated booking slot, rather than an inferred start/end for this ongoing tour. */
async function collectCitySup(context) {
  if (typeof context?.fetchText !== 'function') throw new TypeError('CitySUP source requires fetchText(url)');
  const today = osakaDate(context.now);
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + 31 * 86400000).toISOString().slice(0, 10);
  const calendarUrl = `${CITYSUP_CALENDAR}?start_date=${today}&end_date=${end}&language_type=ja`;
  const [page, calendarText] = await Promise.all([context.fetchText(CITYSUP_PAGE), context.fetchText(calendarUrl)]);
  const pageText = normalizeEvidenceText(visibleText(page));
  for (const value of ['水上さんぽガイドツアー 中之島公園ぐるっと', 'ばらぞの橋', '大阪市北区中之島1丁目1', '中之島公園のまわりをぐるりと一周します。']) {
    if (!pageText.includes(normalizeEvidenceText(value))) throw new Error(`CitySUP official page changed: ${value}`);
  }
  const days = JSON.parse(calendarText);
  if (!Array.isArray(days)) throw new TypeError('CitySUP calendar must be an array');
  const available = days
    .filter((day) => validDateRange(day?.date) && day.date >= today && day.date <= end && day.status === 'realtime')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!available) return { events: [], errors: [], recognized: true };
  const checkedAt = operationCheckedAt(context);
  const evidence = (sourceUrl, text) => ({ sourceUrl, text, checkedAt });
  const occurrence = {
    sourceId: 'verified-outings-citysup-nakanoshima-guided-tour',
    sourceName: '日本シティサップ協会',
    eventName: '水上さんぽガイドツアー 中之島公園ぐるっと',
    startDate: available.date,
    endDate: available.date,
    venueName: 'ばらぞの橋 桟橋',
    officialUrl: CITYSUP_PAGE,
    description: '中之島公園のまわりを船で一周するガイド付きツアー。掲載日は公式予約カレンダーで予約枠を確認した日です。',
    address: '大阪市北区中之島1丁目1',
    price: 'デイタイム：大人 平日1,650円、土日祝2,200円。小人料金・早期予約割引は公式ページで確認。',
    reservationRequired: false,
    reservationInfo: '予約優先、当日現地受付あり。混雑する時間帯は事前予約がおすすめです。',
    accessByTransit: '大阪メトロ堺筋線・京阪本線「北浜」駅、京阪中之島線「なにわ橋」駅。',
    rainPolicy: '雨天でも開催。警報発令時など、スタッフが危険と判断した場合は中止。',
    lastCheckedAt: checkedAt,
    fieldEvidence: {
      eventName: evidence(CITYSUP_PAGE, '水上さんぽガイドツアー 中之島公園ぐるっと'),
      dateRange: evidence(calendarUrl, `"date":"${available.date}"`),
      venueName: evidence(CITYSUP_PAGE, 'ばらぞの橋 桟橋'),
      osakaLocation: evidence(CITYSUP_PAGE, '大阪市北区中之島1丁目1'),
      description: evidence(CITYSUP_PAGE, '中之島公園のまわりをぐるりと一周します。'),
      address: evidence(CITYSUP_PAGE, '大阪市北区中之島1丁目1'),
      price: evidence(CITYSUP_PAGE, '平日 1,500円（税込1,650円）'),
      reservationRequired: evidence(CITYSUP_PAGE, '予約優先、当日現地受付あり'),
      reservationInfo: evidence(CITYSUP_PAGE, '予約優先、当日現地受付あり'),
      accessByTransit: evidence(CITYSUP_PAGE, '大阪メトロ堺筋線「北浜」駅'),
      rainPolicy: evidence(CITYSUP_PAGE, '雨天でも開催しますが、警報発令時などスタッフが危険と判断した場合は中止します'),
    },
  };
  const validation = validateOccurrenceEvidence(new Map([[CITYSUP_PAGE, page], [calendarUrl, calendarText]]), occurrence);
  if (!validation.valid) throw new Error(`CitySUP evidence changed: ${validation.missing.join(', ')}`);
  return { events: [buildEvent(occurrence, { checkedAt })], errors: [], recognized: true };
}

/** Use SCRAP's own bookable day, since its landing page no longer states an end date. */
async function collectScrapCalendar(context, stored) {
  if (typeof context?.fetchText !== 'function') throw new TypeError('SCRAP calendar requires fetchText');
  const now = validNow(context.now);
  if (!isCurrent(stored, now)) return { events: [], errors: [], recognized: true, allowCachedFallback: false };
  const page = await context.fetchText(stored.officialUrl);
  if (typeof context.fetchText.request !== 'function') throw new TypeError('SCRAP calendar requires a request-capable fetchText');
  const pageText = normalizeEvidenceText(visibleText(page));
  for (const field of REQUIRED_EVIDENCE_FIELDS.filter((field) => field !== 'dateRange')) {
    if (!pageText.includes(normalizeEvidenceText(stored.fieldEvidence[field].text))) {
      return { events: [], errors: [`SCRAP official page changed: ${field}`], recognized: false, allowCachedFallback: false };
    }
  }
  if (!pageText.includes(normalizeEvidenceText('2026年5月21日(木)〜'))) {
    return { events: [], errors: ['SCRAP official start date changed'], recognized: false, allowCachedFallback: false };
  }
  const tokenResponse = await context.fetchText.request(SCRAP_TOKEN_URL, { headers: { referer: SCRAP_TICKET_PAGE } });
  const token = JSON.parse(tokenResponse.text);
  if (!/^csrf_[a-z0-9_]+$/u.test(token.token_name ?? '') || !token.csrf_hash) throw new Error('SCRAP CSRF token format changed');
  const cookie = tokenResponse.headers?.getSetCookie?.()
    ?.find((value) => value.startsWith('scrapticket_csrf_cookie_name='))
    ?.split(';', 1)[0];
  if (!cookie) throw new Error('SCRAP CSRF cookie missing');
  const today = osakaDate(now);
  const first = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + 31 * 86400000).toISOString().slice(0, 10);
  const months = [...new Set([first.slice(0, 7), last.slice(0, 7)])];
  let selected;
  for (const month of months) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ shop_id: '95', content_code: '20jikken', target_month: month, display_lang: 'japanese' })) form.append(key, value);
    form.append(token.token_name, token.csrf_hash);
    const response = await context.fetchText.request(SCRAP_MONTH_URL, { method: 'POST', headers: { cookie, referer: SCRAP_TICKET_PAGE }, body: form });
    const calendar = JSON.parse(response.text);
    if (typeof calendar.csrf_hash === 'string' && calendar.csrf_hash) token.csrf_hash = calendar.csrf_hash;
    if (calendar.result !== 'OK' || calendar.target_month !== month || !calendar.days || typeof calendar.days !== 'object') continue;
    const date = Object.keys(calendar.days).sort().find((day) => day >= first && day <= last && calendar.days[day]?.cell === 'available' && calendar.days[day]?.selectable === true);
    if (date) { selected = { date, body: response.text }; break; }
  }
  if (!selected) return { events: [], errors: [], recognized: true };
  const checkedAt = operationCheckedAt(context);
  const occurrence = {
    ...stored,
    startDate: selected.date,
    endDate: selected.date,
    description: `${stored.description} 掲載日は公式チケットカレンダーで予約可能な日です。`,
    price: '一般（平日）前売2,300円・当日2,600円。土日祝やグループ料金は公式サイトで確認。',
    reservationRequired: true,
    reservationInfo: '参加にはチケットが必要。スクラップチケットで購入し、各回の空席を確認してください。',
    parkingInfo: '会場に駐車場・駐輪場はありません。',
    lastCheckedAt: checkedAt,
    fieldEvidence: {
      ...stored.fieldEvidence,
      dateRange: { sourceUrl: SCRAP_MONTH_URL, text: `"${selected.date}"`, checkedAt },
      price: { sourceUrl: stored.officialUrl, text: '一般 : 前売券 2,300円 / 当日券 2,600円', checkedAt },
      reservationRequired: { sourceUrl: stored.officialUrl, text: '小学生以上のご参加には必ずチケットが必要です', checkedAt },
      reservationInfo: { sourceUrl: stored.officialUrl, text: '本イベントはスクラップチケットでのみご購入ができます', checkedAt },
      parkingInfo: { sourceUrl: stored.officialUrl, text: '会場に駐車場、駐輪場はございません', checkedAt },
    },
  };
  const pages = new Map([[stored.officialUrl, page], [SCRAP_MONTH_URL, selected.body]]);
  const validation = validateOccurrenceEvidence(pages, occurrence);
  if (!validation.valid) throw new Error(`SCRAP evidence changed: ${validation.missing.join(', ')}`);
  return { events: [buildEvent(occurrence, { checkedAt })], errors: [], recognized: true };
}

export const VERIFIED_OUTINGS_SOURCE_DEFINITIONS = Object.freeze([...DATA.occurrences.map((occurrence) => Object.freeze({
  id: occurrence.sourceId,
  name: occurrence.sourceName,
  url: occurrence.officialUrl,
  collect: (context) => occurrence.sourceId === 'verified-outings-jikken-lab-osaka-2026'
    ? collectScrapCalendar(context, occurrence)
    : collectOccurrence(context, occurrence),
})), Object.freeze({
  id: 'verified-outings-citysup-nakanoshima-guided-tour',
  name: '日本シティサップ協会',
  url: CITYSUP_PAGE,
  collect: collectCitySup,
})]);

export const __test__ = Object.freeze({
  REQUIRED_EVIDENCE_FIELDS,
  DATA,
  assertDataset,
  buildEvent,
  collectOccurrence,
  collectCitySup,
  collectScrapCalendar,
  isCurrent,
});
