import { createHash } from 'node:crypto';

import { classifyTags, eventCategory } from '../lib/events.mjs';

const OSAKA_TIME_ZONE = 'Asia/Tokyo';

/**
 * Additional cultural sources whose public pages are maintained by the
 * venue/museum itself.  The source URLs are intentionally the pages a user
 * can open, rather than an undocumented API or an inferred calendar URL.
 */
export const CULTURAL_SOURCE_URLS = Object.freeze({
  naturalHistoryMuseum: 'https://omnh.jp/',
  zeppNamba: 'https://www.zepp.co.jp/hall/namba/schedule/',
});

const NATURAL_HISTORY_HOME = CULTURAL_SOURCE_URLS.naturalHistoryMuseum;
const ZEPP_NAMBA_SCHEDULE = CULTURAL_SOURCE_URLS.zeppNamba;

const NATURAL_HISTORY_VENUE = '大阪市立自然史博物館';
const NATURAL_HISTORY_ADDRESS = '〒546-0034 大阪市東住吉区長居公園1-23';
const ZEPP_NAMBA_VENUE = 'Zepp Namba (OSAKA)';
const ZEPP_NAMBA_ADDRESS = '〒556-0012 大阪府大阪市浪速区敷津東2-1-39';

function normalizeDigits(value = '') {
  return String(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[：﹕]/g, ':')
    .replace(/\u00a0/g, ' ');
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([\da-f]+);?/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value = '') {
  return decodeEntities(String(value)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag).match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function absoluteUrl(value, base) {
  if (!value) return undefined;
  try {
    const url = new URL(decodeEntities(value), base);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.href;
  } catch {
    return undefined;
  }
}

function nowDate(now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('now must be a valid Date');
  return date;
}

function osakaDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OSAKA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nowDate(now));
}

function osakaYear(now) {
  return Number(osakaDate(now).slice(0, 4));
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function eraYear(era, value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1) return undefined;
  if (era === '令和') return 2018 + year;
  if (era === '平成') return 1988 + year;
  if (era === '昭和') return 1925 + year;
  return year;
}

/**
 * Parse explicit calendar dates from a source field. Month/year omission is
 * inherited only inside the same source field (e.g. "11月14日、15日"). The
 * day-only alternative is deliberately accepted only with a prior month in
 * the same field; it never invents a month for an isolated "15日".
 */
function dateTokens(value = '', fallbackYear) {
  const text = normalizeDigits(stripTags(value)).replace(/\s+/g, ' ');
  const tokens = [];
  const pattern = /(?:(令和|平成|昭和)\s*(\d+)\s*年|(20\d{2})\s*年)?\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日/g;
  let inheritedYear;
  let inheritedMonth;
  for (const match of text.matchAll(pattern)) {
    const year = eraYear(match[1], match[2]) ?? (match[3] ? Number(match[3]) : inheritedYear ?? fallbackYear);
    const month = Number(match[4]) || inheritedMonth;
    const day = Number(match[5]);
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = validDate(year, month, day);
    if (!date) continue;
    tokens.push({ date, year, month, day, index: match.index ?? 0 });
    inheritedYear = year;
    inheritedMonth = month;
  }
  return tokens;
}

function parseTime(value = '') {
  const text = normalizeDigits(stripTags(value)).replace(/\s+/g, '');
  const match = text.match(/(午前|午後)?(\d{1,2})(?::|時)(?:(\d{2})分?)?/);
  if (!match) return undefined;
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return undefined;
  if (match[1] === '午後' && hour < 12) hour += 12;
  if (match[1] === '午前' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeRange(value = '') {
  const text = normalizeDigits(stripTags(value)).replace(/\s+/g, '');
  const pattern = /(午前|午後)?(\d{1,2})(?::|時)(?:(\d{2})分?)?\s*[〜～至\-–—]\s*(午前|午後)?(\d{1,2})(?::|時)(?:(\d{2})分?)?/;
  const match = text.match(pattern);
  if (match) {
    const start = parseTime(`${match[1] ?? ''}${match[2]}:${match[3] ?? '00'}`);
    const end = parseTime(`${match[4] ?? match[1] ?? ''}${match[5]}:${match[6] ?? '00'}`);
    if (start || end) return { startTime: start, endTime: end, sourceTimeText: stripTags(value) };
  }
  const single = parseTime(text);
  return single ? { startTime: single, sourceTimeText: stripTags(value) } : undefined;
}

function extractBody(html) {
  const body = String(html).match(/<div\b[^>]*class=["'][^"']*\bentry-body\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bentry-footer\b)/i);
  return body?.[1] ?? String(html);
}

function textFromMatch(html, expression) {
  const match = String(html).match(expression);
  return match ? stripTags(match[1]) : '';
}

function lineCandidates(text) {
  return String(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function dateFieldFromBody(bodyText) {
  const lines = lineCandidates(bodyText);
  const labelled = lines.filter((line) => (
    /(?:日\s*時|期\s*間|会\s*期|開催日|開催期間|日\s*程|日程)/u.test(line)
    && !/(?:予約|申込|申込み|受付|対象期間)/u.test(line)
  ));
  if (labelled.length) return labelled.join(' ');
  // Some announcements put the actual date in the opening sentence and only
  // introduce the section heading later. Use the first few body lines, never
  // the article publication metadata in <header>.
  return lines.slice(0, 5).join(' ');
}

function parseNaturalHistoryDates(bodyText, fallbackYear) {
  const field = dateFieldFromBody(bodyText);
  const tokens = dateTokens(field, fallbackYear);
  if (!tokens.length) return [];
  const unique = [...new Map(tokens.map((token) => [token.date, token])).values()];
  const normalizedField = normalizeDigits(field);
  // Only a separator between the first two date tokens denotes a date range.
  // A field can also contain an independent time range ("10:00～16:00")
  // after a discrete date list; checking the whole field would merge those
  // dates into a fictitious interval.
  const betweenDates = unique.length >= 2
    ? normalizedField.slice(unique[0].index, unique[1].index)
    : '';
  const hasRange = /[〜～至\-–—]/u.test(betweenDates);
  if (hasRange && unique.length >= 2) {
    const start = unique[0].date;
    const end = unique[1].date;
    if (end >= start) return [{ startDate: start, endDate: end, sourceDateText: field }];
  }
  return unique.map((token) => ({ startDate: token.date, endDate: token.date, sourceDateText: field }));
}

function labelledValue(text, expression) {
  const line = lineCandidates(text).find((candidate) => expression.test(candidate));
  if (!line) return undefined;
  const match = line.match(expression);
  return match?.[1]?.trim();
}

function naturalHistoryVenue(bodyText) {
  return labelledValue(bodyText, /(?:■|●|◆)?\s*(?:(?:対面)?会\s*場|場所|開催場所|開催会場)\s*[:：]\s*(.+)$/u);
}

function isOsakaNaturalHistoryVenue(value) {
  const venue = String(value ?? '');
  // Keep the map Osaka-scoped. A museum article can describe an off-site
  // observation or hike; without an explicit Osaka/Longai/museum venue marker
  // it must not inherit the museum's address or enter this source.
  return /(?:大阪(?:府|市)?|大阪市立自然史博物館|長居(?:公園|植物園)?|ネイチャーホール)/u.test(venue)
    && !/(?:京都|兵庫|奈良|和歌山|滋賀|三重|東京|愛知|岡山|木津川中流域)/u.test(venue);
}

function naturalHistoryPrice(bodyText) {
  return labelledValue(bodyText, /(?:■|●|◆)?\s*(?:参\s*加\s*費|参\s*加\s*料\s*金|入\s*場\s*料|入\s*館\s*料|観\s*覧\s*料|料\s*金)\s*[:：]\s*(.+)$/u);
}

function naturalHistoryAudience(bodyText) {
  return labelledValue(bodyText, /(?:■|●|◆)?\s*(?:対\s*象\s*者|対\s*象)\s*[:：]\s*(.+)$/u);
}

function summaryFromBody(bodyText) {
  const lines = lineCandidates(bodyText).filter((line) => !/^(?:■|●|◆)?\s*(?:日\s*時|期\s*間|会\s*期|開催日|開催期間|日\s*程|日程|場所|(?:対面)?会\s*場|参\s*加\s*費|入\s*館\s*料|観\s*覧\s*料|料\s*金|対象者|対象)\s*[:：]/u.test(line));
  return lines.find((line) => line.length >= 12)?.slice(0, 280);
}

function makeEvent({ sourceId, sourceName, sourceUrl, eventName, startDate, endDate, venueName, address, description, price, audience, category, officialUrl, imageUrl, time, checkedAt, sourceDateText }) {
  if (!eventName || !startDate || !endDate) return undefined;
  const tagResult = classifyTags({ name: eventName, description: `${description ?? ''} ${sourceDateText ?? ''}`, price, audience });
  const identity = [sourceId, eventName, startDate, endDate, venueName ?? '', address ?? '', officialUrl ?? '']
    .map((part) => String(part).normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s\u3000\p{P}\p{S}]+/gu, ''))
    .join('|');
  return {
    id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
    eventName: stripTags(eventName),
    ...(venueName ? { venueName: stripTags(venueName) } : {}),
    category: category ?? eventCategory(eventName, description),
    ...(description ? { description: stripTags(description) } : {}),
    ...(address ? { address: stripTags(address) } : {}),
    startDate,
    endDate,
    ...(time?.startTime ? { startTime: time.startTime } : {}),
    ...(time?.endTime ? { endTime: time.endTime } : {}),
    ...(price ? { price: stripTags(price) } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(tagResult.tags.length ? { tags: tagResult.tags, tagEvidence: tagResult.tagEvidence } : {}),
    source: sourceName,
    sourceUrl,
    lastCheckedAt: checkedAt,
    sourceId,
    evidence: {
      date: stripTags(sourceDateText),
      ...(venueName ? { venue: stripTags(venueName) } : {}),
      ...(time?.sourceTimeText ? { time: stripTags(time.sourceTimeText) } : {}),
      url: officialUrl,
    },
  };
}

function isCurrent(event, now) {
  return !event.endDate || event.endDate >= osakaDate(now);
}

function sourceResult(events = [], errors = [], recognized = true) {
  return { events, errors, recognized };
}

function extractNaturalHistoryPostLinks(html, sourceUrl) {
  const links = new Map();
  const pattern = /<a\b([^>]*\bhref\s*=\s*["'][^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const href = absoluteUrl(attr(match[1], 'href'), sourceUrl);
    if (!href || !/^https:\/\/omnh\.jp\/archives\/\d+/i.test(href)) continue;
    const inner = match[2] ?? '';
    const title = attr(match[1], 'aria-label') || stripTags(inner);
    if (!title || /^(?:続きを読む|画像|カテゴリー)/u.test(title)) continue;
    links.set(href, title);
  }
  return [...links.entries()].map(([url, title]) => ({ url, title }));
}

export function parseNaturalHistoryDetailPage(html, { checkedAt, now, source, officialUrl, listingTitle } = {}) {
  const body = extractBody(html);
  const bodyText = stripTags(body);
  const title = textFromMatch(html, /<h1\b[^>]*class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || listingTitle;
  const dateRanges = parseNaturalHistoryDates(bodyText, osakaYear(now));
  const venueRaw = naturalHistoryVenue(bodyText);
  const venue = venueRaw || undefined;
  if (!isOsakaNaturalHistoryVenue(venue)) return [];
  // The museum address is applied only when the article explicitly names the
  // museum as the venue. Off-site observations keep their source venue and do
  // not receive an inferred address.
  const address = venue && /大阪市立自然史博物館/u.test(venue) ? NATURAL_HISTORY_ADDRESS : undefined;
  const price = naturalHistoryPrice(bodyText);
  const audience = naturalHistoryAudience(bodyText);
  const dateField = dateFieldFromBody(bodyText);
  const time = parseTimeRange(dateField);
  const image = textFromMatch(body, /<img\b([^>]*)>/i);
  const imageUrl = absoluteUrl(attr(image, 'src') || attr(image, 'data-src'), source.url);
  const description = summaryFromBody(bodyText);
  return dateRanges
    .map((range) => makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      ...range,
      venueName: venue,
      address,
      description,
      price,
      audience,
      category: eventCategory(title, `${description ?? ''} 博物館`),
      officialUrl,
      imageUrl,
      time,
      checkedAt,
      sourceDateText: range.sourceDateText,
    }))
    .filter((event) => event && isCurrent(event, now));
}

export function parseNaturalHistoryPage(html, { checkedAt, now, source } = {}) {
  const links = extractNaturalHistoryPostLinks(html, source.url);
  return { links, recognized: links.length > 0 };
}

async function collectNaturalHistory({ fetchText, checkedAt, now, source }) {
  const html = await fetchText(NATURAL_HISTORY_HOME);
  const listing = parseNaturalHistoryPage(html, { checkedAt, now, source });
  if (!listing.recognized) return sourceResult([], [], false);
  const events = [];
  const errors = [];
  for (const { url, title } of listing.links) {
    try {
      const detail = await fetchText(url);
      events.push(...parseNaturalHistoryDetailPage(detail, { checkedAt, now, source, officialUrl: url, listingTitle: title }));
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return sourceResult(events, errors, true);
}

function parseZeppDate(yearText, monthDayText) {
  const year = Number(normalizeDigits(yearText));
  const match = normalizeDigits(monthDayText).match(/^(\d{1,2})[./](\d{1,2})$/);
  if (!year || !match) return undefined;
  const date = validDate(year, Number(match[1]), Number(match[2]));
  return date ? { startDate: date, endDate: date, sourceDateText: `${yearText} ${monthDayText}` } : undefined;
}

export function parseZeppNambaPage(html, { checkedAt, now, source } = {}) {
  const events = [];
  const cardPattern = /<a\b([^>]*class=["'][^"']*\bsch-content\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(cardPattern)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const year = textFromMatch(inner, /<p\b[^>]*class=["'][^"']*\bsch-content-date__year\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const monthDay = textFromMatch(inner, /<p\b[^>]*class=["'][^"']*\bsch-content-date__month\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const range = parseZeppDate(year, monthDay);
    const performer = textFromMatch(inner, /<h2\b[^>]*class=["'][^"']*\bsch-content-text__performer\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
    const title = textFromMatch(inner, /<h3\b[^>]*class=["'][^"']*\bsch-content-text__ttl\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
    const eventName = title || performer;
    if (!range || !eventName || /(?:公演中止|開催中止|中止)/u.test(`${performer} ${title}`)) continue;
    const open = textFromMatch(inner, /<span\b[^>]*class=["'][^"']*\bsch-content-text-date__open\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const start = textFromMatch(inner, /<span\b[^>]*class=["'][^"']*\bsch-content-text-date__start\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const time = open || start ? {
      // Zepp labels OPEN (doors) and START (the performance). START is the
      // event's start; OPEN is retained only in evidence, never as endTime.
      ...(parseTime(start) ? { startTime: parseTime(start) } : {}),
      sourceTimeText: [open && `[OPEN] ${open}`, start && `[START] ${start}`].filter(Boolean).join(' '),
    } : undefined;
    const price = textFromMatch(inner, /<p\b[^>]*>\s*\[PRICE\]([\s\S]*?)<\/p>/i);
    const image = textFromMatch(inner, /<img\b([^>]*)>/i);
    const officialUrl = absoluteUrl(attr(attrs, 'href'), source.url);
    const description = performer && title && performer !== title ? performer : undefined;
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName,
      ...range,
      venueName: ZEPP_NAMBA_VENUE,
      address: ZEPP_NAMBA_ADDRESS,
      description,
      price,
      category: 'music',
      officialUrl,
      imageUrl: absoluteUrl(attr(image, 'src'), source.url),
      time,
      checkedAt,
      sourceDateText: range.sourceDateText,
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

export const CULTURAL_SOURCE_DEFINITIONS = Object.freeze([
  {
    id: 'osaka-natural-history-museum',
    name: '大阪市立自然史博物館',
    url: NATURAL_HISTORY_HOME,
    collect: (context) => collectNaturalHistory({ ...context, source: CULTURAL_SOURCE_DEFINITIONS[0] }),
  },
  {
    id: 'zepp-namba',
    name: 'Zepp Namba (OSAKA)',
    url: ZEPP_NAMBA_SCHEDULE,
    collect: async (context) => {
      const html = await context.fetchText(ZEPP_NAMBA_SCHEDULE);
      return sourceResult(parseZeppNambaPage(html, { ...context, source: CULTURAL_SOURCE_DEFINITIONS[1] }), [], /sch-content\b|sch-content-date__year/i.test(html));
    },
  },
]);

export const __test__ = Object.freeze({
  parseNaturalHistoryPage,
  parseNaturalHistoryDetailPage,
  parseZeppNambaPage,
  dateTokens,
  parseNaturalHistoryDates,
});
