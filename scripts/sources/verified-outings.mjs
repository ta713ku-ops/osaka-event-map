import { readFileSync } from 'node:fs';
import { eventCategory, httpUrl, normalize, normalizeEventRecord, normalizeDate, validDateRange } from '../lib/events.mjs';

const OSAKA_TIME_ZONE = 'Asia/Tokyo';
const REQUIRED_EVIDENCE_FIELDS = Object.freeze(['eventName', 'dateRange', 'venueName', 'osakaLocation', 'description']);
const OPTIONAL_EVENT_FIELDS = Object.freeze(['price', 'freeEvent', 'timeInfo', 'reservationInfo', 'reservationRequired', 'reservationUrl', 'contact', 'accessByTransit', 'accessByCar', 'nearestStation', 'rainPolicy', 'parkingInfo', 'closureInfo', 'startTime', 'endTime', 'schedule', 'officialStatus', 'statusEvidence']);
const DATA_URL = new URL('../../data/verified-outings.json', import.meta.url);
const DATA = JSON.parse(readFileSync(DATA_URL, 'utf8'));
const CITYSUP_DETAILS = JSON.parse(readFileSync(new URL('../../data/information-supplement-integrated-20261003.json', import.meta.url), 'utf8'))
  .updates.find((item) => item.match.sourceId === 'verified-outings-citysup-nakanoshima-guided-tour');
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
    for (const field of ['address', ...OPTIONAL_EVENT_FIELDS].filter((field) => occurrence[field] !== undefined)) {
      const evidence = occurrence.fieldEvidence?.[field];
      if (!httpUrl(evidence?.sourceUrl) || !String(evidence?.text ?? '').trim()
        || !Number.isFinite(new Date(evidence?.checkedAt).getTime())) {
        throw new TypeError(`missing ${field} evidence for ${occurrence.sourceId}`);
      }
    }
    if (occurrence.fieldEvidence.eventName.sourceUrl !== occurrence.officialUrl
      && !(occurrence.evidenceAssets ?? []).some((asset) => asset.url === occurrence.fieldEvidence.eventName.sourceUrl && asset.primaryPage === occurrence.officialUrl)) {
      throw new TypeError(`event name evidence must come from officialUrl for ${occurrence.sourceId}`);
    }
    for (const asset of occurrence.evidenceAssets ?? []) {
      if (!httpUrl(asset?.url) || !/^[a-f0-9]{64}$/u.test(asset?.sha256 ?? '')
        || !String(asset?.text ?? '').trim() || !['pdf', 'image'].includes(asset?.kind)
        || !String(asset?.extractionMethod ?? '').trim() || !Number.isFinite(new Date(asset?.checkedAt).getTime())) {
        throw new TypeError(`invalid reviewed official attachment for ${occurrence.sourceId}`);
      }
    }
  }
  return occurrences;
}

assertDataset(DATA.occurrences);

function getPage(pages, url) {
  return pages instanceof Map ? pages.get(url) : pages?.[url];
}

function declaredMetaDescription(html) {
  const clean = String(html ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '');
  for (const tag of clean.match(/<meta\b[^>]*>/giu) ?? []) {
    const name = /\bname\s*=\s*(["'])(.*?)\1/iu.exec(tag)?.[2];
    if (name?.toLowerCase() !== 'description') continue;
    return visibleText(/\bcontent\s*=\s*(["'])(.*?)\1/iu.exec(tag)?.[2] ?? '');
  }
  return '';
}

/** Check each stored field against the official page named by its evidence. */
export function validateOccurrenceEvidence(pages, occurrence) {
  const missing = [];
  for (const field of Object.keys(occurrence?.fieldEvidence ?? {})) {
    const evidence = occurrence?.fieldEvidence?.[field];
    const page = evidence ? getPage(pages, evidence.sourceUrl) : undefined;
    const pageText = normalizeEvidenceText(evidence?.extractionMethod === 'html-meta-description'
      ? declaredMetaDescription(page) : visibleText(page));
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
      ...(stored.sha256 ? { sha256: stored.sha256 } : {}),
      ...(stored.extractionMethod ? { extractionMethod: stored.extractionMethod } : {}),
      ...(stored.evidenceKind ? { evidenceKind: stored.evidenceKind } : {}),
    }];
  }));
  return normalizeEventRecord({
    eventName: occurrence.eventName,
    venueName: occurrence.venueName,
    description: occurrence.description,
    ...(occurrence.address ? { address: occurrence.address } : {}),
    ...Object.fromEntries(OPTIONAL_EVENT_FIELDS
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
    ...(occurrence.evidenceAssets ?? []).map((asset) => asset.url),
    occurrence.officialUrl,
    ...Object.values(occurrence.fieldEvidence).map((evidence) => evidence.sourceUrl),
  ])];
  const pages = new Map();
  const assets = new Map((occurrence.evidenceAssets ?? []).map((asset) => [asset.url, asset]));
  if (assets.size) {
    const ages = [...assets.values()].map((asset) => now.getTime() - new Date(asset.checkedAt).getTime());
    if (ages.some((age) => age < 0 || age > 14 * 86400000)) return { events: [], errors: ['reviewed attachment snapshot has expired; manual reread required'], recognized: false, allowCachedFallback: false };
  }
  try {
    for (const url of urls) {
      const asset = assets.get(url);
      if (!asset) { pages.set(url, await context.fetchText(url)); continue; }
      if (typeof context.fetchText.assetHash !== 'function') throw new TypeError('reviewed official attachment requires assetHash(url)');
      if (await context.fetchText.assetHash(url) !== asset.sha256) return { events: [], errors: ['official attachment changed; manual reread required'], recognized: false, allowCachedFallback: false };
      pages.set(url, asset.text);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const age = now.getTime() - new Date(occurrence.lastCheckedAt).getTime();
    return {
      events: age >= 0 && age <= 14 * 86400000 ? [buildEvent(occurrence, { checkedAt: occurrence.lastCheckedAt, stale: true })] : [],
      errors: [`official page fetch failed; retaining last verified timestamp: ${message}`],
      recognized: true,
      // This one-occurrence manifest has already selected its bounded snapshot.
      // Generic recovery must not add older names/ids from the same source.
      allowCachedFallback: false,
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
    events: [buildEvent(occurrence, { checkedAt: operationCheckedAt(context), stale: assets.size > 0 })],
    errors: assets.size ? ['official attachment hash matches; text remains a dated manually reviewed snapshot, not an automatic reread'] : [],
    recognized: true,
    allowCachedFallback: false,
  };
}

/** Preserve every verified bookable day; the interval never proves unlisted days. */
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
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!available.length) return { events: [], errors: [], recognized: true, allowCachedFallback: false };
  const dates = [...new Set(available.map((day) => day.date))];
  const checkedAt = operationCheckedAt(context);
  const evidence = (sourceUrl, text) => ({ sourceUrl, text, checkedAt });
  const occurrence = {
    sourceId: 'verified-outings-citysup-nakanoshima-guided-tour',
    sourceName: '日本シティサップ協会',
    eventName: '水上さんぽガイドツアー 中之島公園ぐるっと',
    startDate: dates[0],
    endDate: dates.at(-1),
    schedule: { dates, evidence: '公式予約カレンダーで予約枠を確認した日のみ。未掲載日・満席日は開催を断定しない。' },
    venueName: 'ばらぞの橋 桟橋',
    officialUrl: CITYSUP_PAGE,
    description: '中之島公園のまわりを船で一周するガイド付きツアー。開催日は公式予約カレンダーで予約枠を確認した日のみを掲載しています。',
    address: '大阪市北区中之島1丁目1',
    price: 'デイタイム：大人 平日1,650円、土日祝2,200円。小人料金・早期予約割引は公式ページで確認。',
    reservationRequired: false,
    reservationInfo: '予約優先、当日現地受付あり。混雑する時間帯は事前予約がおすすめです。',
    accessByTransit: '大阪メトロ堺筋線・京阪本線「北浜」駅、京阪中之島線「なにわ橋」駅。',
    rainPolicy: '雨天でも開催。警報発令時など、スタッフが危険と判断した場合は中止。',
    lastCheckedAt: checkedAt,
    fieldEvidence: {
      eventName: evidence(CITYSUP_PAGE, '水上さんぽガイドツアー 中之島公園ぐるっと'),
      dateRange: evidence(calendarUrl, `"date":"${dates[0]}"`),
      schedule: evidence(calendarUrl, `"date":"${dates[0]}"`),
      ...Object.fromEntries(dates.map((date) => [`schedule_${date}`, evidence(calendarUrl, `"date":"${date}","status":"realtime"`)])),
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
  // These are independently checked daytime details, never calendar dates or
  // departure clocks. Validate every quote against this same live page below.
  Object.assign(occurrence, CITYSUP_DETAILS.fields);
  Object.assign(occurrence.fieldEvidence, CITYSUP_DETAILS.fieldEvidence);
  const validation = validateOccurrenceEvidence(new Map([[CITYSUP_PAGE, page], [calendarUrl, calendarText]]), occurrence);
  if (!validation.valid) throw new Error(`CitySUP evidence changed: ${validation.missing.join(', ')}`);
  return { events: [buildEvent(occurrence, { checkedAt })], errors: [], recognized: true };
}

/** The night tour has a different route/boarding venue and its own calendar. */
async function collectCitySupNight(context, stored) {
  if (typeof context?.fetchText !== 'function') throw new TypeError('CitySUP night source requires fetchText');
  const today = osakaDate(context.now);
  if (today > stored.endDate) return { events: [], errors: [], recognized: true, allowCachedFallback: false };
  const end = stored.endDate;
  const calendarUrl = `https://citysup.urkt.in/api/direct/courses/16569/calendars?start_date=${today}&end_date=${end}&language_type=ja`;
  const urls = [...new Set([stored.officialUrl, ...Object.entries(stored.fieldEvidence)
    .filter(([key]) => !['dateRange', 'schedule'].includes(key) && !key.startsWith('schedule_')).map(([, evidence]) => evidence.sourceUrl)])];
  const pages = new Map();
  for (const url of urls) pages.set(url, await context.fetchText(url));
  const calendarText = await context.fetchText(calendarUrl);
  const days = JSON.parse(calendarText);
  if (!Array.isArray(days)) throw new TypeError('CitySUP night calendar must be an array');
  const dates = [...new Set(days.filter((day) => validDateRange(day?.date) && day.date >= today && day.date <= end && day.status === 'realtime').map((day) => day.date))].sort();
  if (!dates.length) return { events: [], errors: [], recognized: true, allowCachedFallback: false };
  const checkedAt = operationCheckedAt(context);
  const occurrence = { ...stored, startDate: dates[0], endDate: dates.at(-1),
    schedule: { dates, evidence: '夜のツアー専用の公式予約カレンダーで予約枠を確認した日のみ。満席・未確認日は補間しない。' },
    fieldEvidence: { ...Object.fromEntries(Object.entries(stored.fieldEvidence).filter(([key]) => !key.startsWith('schedule_'))),
      dateRange: { sourceUrl: calendarUrl, text: `"date":"${dates[0]}"`, checkedAt },
      schedule: { sourceUrl: calendarUrl, text: `"date":"${dates[0]}"`, checkedAt },
      ...Object.fromEntries(dates.map((date) => [`schedule_${date}`, { sourceUrl: calendarUrl, text: `"date":"${date}","status":"realtime"`, checkedAt }])),
    }, lastCheckedAt: checkedAt };
  pages.set(calendarUrl, calendarText);
  const validation = validateOccurrenceEvidence(pages, occurrence);
  if (!validation.valid) return { events: [], errors: [`CitySUP night official evidence changed: ${validation.missing.join(', ')}`], recognized: false, allowCachedFallback: false };
  return { events: [buildEvent(occurrence, { checkedAt })], errors: [], recognized: true };
}

/** Use only SCRAP's verified bookable days, without extending its old stored period. */
async function collectScrapCalendar(context, stored) {
  if (typeof context?.fetchText !== 'function') throw new TypeError('SCRAP calendar requires fetchText');
  const now = validNow(context.now);
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
  const first = today;
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + 31 * 86400000).toISOString().slice(0, 10);
  const months = [...new Set([first.slice(0, 7), last.slice(0, 7)])];
  const dates = [];
  const calendarBodies = [];
  const dateEvidence = {};
  for (const month of months) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ shop_id: '95', content_code: '20jikken', target_month: month, display_lang: 'japanese' })) form.append(key, value);
    form.append(token.token_name, token.csrf_hash);
    const response = await context.fetchText.request(SCRAP_MONTH_URL, { method: 'POST', headers: { cookie, referer: SCRAP_TICKET_PAGE }, body: form });
    const calendar = JSON.parse(response.text);
    if (typeof calendar.csrf_hash === 'string' && calendar.csrf_hash) token.csrf_hash = calendar.csrf_hash;
    if (calendar.result !== 'OK' || calendar.target_month !== month || !calendar.days || typeof calendar.days !== 'object' || Array.isArray(calendar.days)) {
      throw new TypeError(`SCRAP calendar response was not recognized for ${month}`);
    }
    const verified = Object.keys(calendar.days).sort().filter((day) => validDateRange(day) && day.startsWith(month) && day >= first && day <= last && calendar.days[day]?.cell === 'available' && calendar.days[day]?.selectable === true);
    dates.push(...verified);
    calendarBodies.push(response.text);
    for (const date of verified) dateEvidence[`schedule_${date}`] = {
      sourceUrl: SCRAP_MONTH_URL, text: `"${date}"`, checkedAt: operationCheckedAt(context),
    };
  }
  const closedDates = stored.schedule?.closedDates ?? [];
  const verifiedDates = [...new Set(dates)].filter((date) => !closedDates.includes(date)).sort();
  if (!verifiedDates.length) return { events: [], errors: [], recognized: true, allowCachedFallback: false };
  const calendarEvidence = calendarBodies.join('\n');
  const checkedAt = operationCheckedAt(context);
  const occurrence = {
    ...stored,
    startDate: verifiedDates[0],
    endDate: verifiedDates.at(-1),
    schedule: { dates: verifiedDates, ...(closedDates.length ? { closedDates } : {}), evidence: '公式チケットカレンダーで予約可能と確認した日のみ。未確認日・販売なし・満席・公式休業の日は開催を断定しない。' },
    description: `${stored.description} 開催日は公式チケットカレンダーで予約可能と確認した日のみを掲載しています。`,
    price: stored.price ?? '一般（平日）前売2,300円・当日2,600円。土日祝やグループ料金は公式サイトで確認。',
    reservationRequired: true,
    reservationInfo: stored.reservationInfo ?? '参加にはチケットが必要。スクラップチケットで購入し、各回の空席を確認してください。',
    parkingInfo: stored.parkingInfo ?? '会場に駐車場・駐輪場はありません。',
    lastCheckedAt: checkedAt,
    fieldEvidence: {
      ...Object.fromEntries(Object.entries(stored.fieldEvidence).filter(([key]) => !key.startsWith('schedule_'))),
      // Calendar responses contain rotating CSRF material. Publish only the
      // verified date keys as provenance, never the session response body.
      dateRange: { sourceUrl: SCRAP_MONTH_URL, text: `"${verifiedDates[0]}"`, checkedAt },
      schedule: { sourceUrl: SCRAP_MONTH_URL, text: `"${verifiedDates[0]}"`, checkedAt },
      ...(closedDates.length ? { scheduledClosures: stored.fieldEvidence.schedule } : {}),
      ...dateEvidence,
      price: stored.fieldEvidence.price ?? { sourceUrl: stored.officialUrl, text: '一般 : 前売券 2,300円 / 当日券 2,600円', checkedAt },
      reservationRequired: { sourceUrl: stored.officialUrl, text: '小学生以上のご参加には必ずチケットが必要です', checkedAt },
      reservationInfo: stored.fieldEvidence.reservationInfo ?? { sourceUrl: stored.officialUrl, text: '本イベントはスクラップチケットでのみご購入ができます', checkedAt },
      parkingInfo: stored.fieldEvidence.parkingInfo ?? { sourceUrl: stored.officialUrl, text: '会場に駐車場、駐輪場はございません', checkedAt },
    },
  };
  const pages = new Map([[stored.officialUrl, page], [SCRAP_MONTH_URL, calendarEvidence]]);
  for (const url of new Set(Object.values(occurrence.fieldEvidence).map((evidence) => evidence.sourceUrl))) {
    if (!pages.has(url)) pages.set(url, await context.fetchText(url));
  }
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
    : occurrence.sourceId === 'verified-outings-citysup-night-nakanoshima-2026'
      ? collectCitySupNight(context, occurrence)
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
  collectCitySupNight,
  collectScrapCalendar,
  isCurrent,
});
