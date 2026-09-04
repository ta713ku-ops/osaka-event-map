import { createHash } from 'node:crypto';

import {
  CULTURAL_SOURCE_DEFINITIONS,
  CULTURAL_SOURCE_URLS,
  __test__ as culturalTest,
} from './cultural.mjs';

/**
 * Additional first-party event sources.
 *
 * The collector deliberately accepts fetchText instead of doing its own
 * network policy.  The parent collector owns timeout, user-agent and cache
 * behaviour; this module only parses public responses from the listed
 * official pages/endpoints.
 */

const OSAKA_TIME_ZONE = 'Asia/Tokyo';

export const SOURCE_URLS = Object.freeze({
  osakaCity: 'https://www.city.osaka.lg.jp/main/event2/curr.html',
  osakaInfo: 'https://osaka-info.jp/event/',
  osakaArtMuseum: 'https://www.osaka-art-museum.jp/planned_exhibition',
  nakkaMuseum: 'https://nakka-art.jp/exhibition/held/',
  festivalHall: 'https://www.festivalhall.jp/events/list/',
  aeonOsakaDomeCity: 'https://www.aeon.jp/sc/osakadomecity/event/',
  aeonDainichi: 'https://www.aeon.jp/sc/dainichi/event/',
  aeonHineno: 'https://www.aeon.jp/sc/hineno/event/',
  aeonIbaraki: 'https://www.aeon.jp/sc/ibaraki/event/',
  hankyuUmeda: 'https://www.hankyu-dept.co.jp/honten/event/',
  ...CULTURAL_SOURCE_URLS,
});

const OSAKA_INFO_API = 'https://osaka-info.jp/api_/orden/get_event_list.php';
const AEON_INDEX = 'https://www.aeon.jp/sc/osakadomecity/event/index.json';

// These four entries are linked from the official AEON shopping-centre
// directory.  The three additional stores use the same public index.json
// contract as Osaka Dome City; each endpoint and address was checked before
// being added.  Other Osaka malls in the directory currently use a separate
// site/app contract and are intentionally not guessed here.
const AEON_SOURCE_CONFIGS = Object.freeze([
  {
    id: 'aeon-osaka-dome-city',
    name: 'イオンモール大阪ドームシティ',
    url: SOURCE_URLS.aeonOsakaDomeCity,
    indexUrl: AEON_INDEX,
    venueName: 'イオンモール大阪ドームシティ',
    address: '大阪市西区千代崎三丁目13番1',
  },
  {
    id: 'aeon-dainichi',
    name: 'イオンモール大日',
    url: SOURCE_URLS.aeonDainichi,
    indexUrl: 'https://www.aeon.jp/sc/dainichi/event/index.json',
    venueName: 'イオンモール大日',
    address: '大阪府守口市大日東町1-18',
  },
  {
    id: 'aeon-hineno',
    name: 'イオンモール日根野',
    url: SOURCE_URLS.aeonHineno,
    indexUrl: 'https://www.aeon.jp/sc/hineno/event/index.json',
    venueName: 'イオンモール日根野',
    address: '大阪府泉佐野市日根野2496-1',
  },
  {
    id: 'aeon-ibaraki',
    name: 'イオンモール茨木',
    url: SOURCE_URLS.aeonIbaraki,
    indexUrl: 'https://www.aeon.jp/sc/ibaraki/event/index.json',
    venueName: 'イオンモール茨木',
    address: '大阪府茨木市松ケ本町8-30',
  },
]);

const FIXED_VENUES = Object.freeze({
  osakaArtMuseum: {
    venueName: '大阪市立美術館',
    address: '大阪府大阪市天王寺区茶臼山町1-82（天王寺公園内）',
  },
  nakkaMuseum: {
    venueName: '大阪中之島美術館',
    address: '大阪府大阪市北区中之島4-3-1',
  },
  festivalHall: {
    venueName: 'フェスティバルホール',
    address: '大阪市北区中之島2-3-18',
  },
  aeonOsakaDomeCity: {
    venueName: 'イオンモール大阪ドームシティ',
    address: '大阪市西区千代崎三丁目13番1',
  },
  hankyuUmeda: {
    venueName: '阪急うめだ本店',
    address: '大阪府大阪市北区角田町8番7号',
  },
});

const HANKYU_PLACE_NAMES = Object.freeze({
  sj: '9階 催場',
  ss: '9階 祝祭広場',
  gl: '9階 阪急うめだギャラリー',
  as: '9階 アートステージ',
  hl: '9階 阪急うめだホール',
  bg: '7階 美術画廊・8階 コンテンポラリーアートギャラリー',
  cc: '1階 コトコトステージ11・12',
  tr: '地下1階 ツリーテラス',
  fo: '地下2階 フードイベントプラザ',
});

function normalizeDigits(value = '') {
  return String(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':');
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
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function textFromMatch(html, expression) {
  const match = html.match(expression);
  return match ? stripTags(match[1]) : '';
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
    // Some official feeds still emit an http detail URL.  The same-origin
    // page is available over HTTPS, so upgrade it without changing hosts.
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

function checkedAtFor(now) {
  return nowDate(now).toISOString();
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

/** Extract ISO, dotted and Japanese date tokens while retaining explicit years. */
function dateTokens(value = '') {
  const text = normalizeDigits(stripTags(value));
  const tokens = [];
  // A few official calendars abbreviate the end as "9月6日～12日".  The
  // final alternative is intentionally constrained to a day after a range
  // separator, so it cannot turn an arbitrary number (price/year) into a
  // date.
  const pattern = /(?:(20\d{2})[./-](\d{1,2})[./-](\d{1,2}))|(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日|(?<=[〜～至\-–—])\s*(\d{1,2})日/g;
  for (const match of text.matchAll(pattern)) {
    const year = Number(match[1] ?? match[4] ?? 0) || undefined;
    const month = Number(match[2] ?? match[5]) || undefined;
    const day = Number(match[3] ?? match[6] ?? match[7]);
    if ((month === undefined || (month >= 1 && month <= 12)) && day >= 1 && day <= 31) {
      tokens.push({ year, month, day, index: match.index ?? 0 });
    }
  }
  return tokens;
}

function parseDateRange(value, fallbackYear) {
  const sourceText = stripTags(value);
  // A listing such as "9月4日・6日" contains multiple discrete dates.  A
  // single EventItem cannot represent that schedule faithfully, so do not
  // silently turn it into a same-day or first-to-last interval.  Adapters
  // that receive structured schedules emit one record per date instead.
  // Weekday annotations may legitimately contain the middle dot (for
  // example, "火・休").  Remove parenthesized annotations before checking
  // for a date-list separator so those do not suppress a valid range.
  const dateListText = sourceText.replace(/（[^）]*）|\([^)]*\)/g, '');
  if (/[・、,]/.test(dateListText)) return undefined;
  const tokens = dateTokens(value);
  if (!tokens.length) return undefined;
  const first = tokens[0];
  const startYear = first.year ?? fallbackYear;
  if (!Number.isInteger(startYear)) return undefined;
  const startDate = validDate(startYear, first.month, first.day);
  if (!startDate) return undefined;
  const last = tokens[1] ?? first;
  const endMonth = last.month ?? first.month;
  let endYear = last.year ?? startYear;
  // A source such as "12月30日～1月3日" crosses a calendar year.
  if (!last.year && (endMonth < first.month || (endMonth === first.month && last.day < first.day))) endYear += 1;
  const endDate = validDate(endYear, endMonth, last.day);
  if (!endDate) return undefined;
  return {
    startDate,
    endDate,
    sourceDateText: sourceText,
  };
}

function timeValue(meridiem, hour, minute) {
  let normalizedHour = Number(hour);
  const minutes = Number(minute ?? 0);
  if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23 || minutes < 0 || minutes > 59) return undefined;
  if (meridiem === '午後' && normalizedHour < 12) normalizedHour += 12;
  if (meridiem === '午前' && normalizedHour === 12) normalizedHour = 0;
  return `${String(normalizedHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimeRange(value = '') {
  const text = normalizeDigits(stripTags(value)).replace(/\s+/g, '');
  // Require an explicit time unit on both sides.  Without this constraint,
  // date fragments such as "2026-09-04" or "9-10" can be mistaken for a
  // time range.  The adapters call this only on source time fields, but the
  // parser remains safe when tested against arbitrary text.
  const pattern = /(午前|午後)?(\d{1,2})(?::|時)(?:(\d{2})分?)?\s*[〜～至\-–—]\s*(午前|午後)?(\d{1,2})(?::|時)(?:(\d{2})分?)?/;
  const range = text.match(pattern);
  if (range) {
    const start = timeValue(range[1], range[2], range[3]);
    const end = timeValue(range[4] ?? range[1], range[5], range[6]);
    if (start || end) return { startTime: start, endTime: end, sourceTimeText: stripTags(value) };
  }
  const single = text.match(/(午前|午後)?(\d{1,2}):(\d{2})/);
  if (single) {
    const start = timeValue(single[1], single[2], single[3]);
    if (start) return { startTime: start, sourceTimeText: stripTags(value) };
  }
  return undefined;
}

function atDate(date, time) {
  if (!date || !time) return undefined;
  return `${date}T${time}:00+09:00`;
}

function categoryFor(text, fallback = 'seasonal') {
  const value = String(text);
  if (/展覧|展示|美術|ギャラリー|アート|博物|作品展|写真展|絵画展|作陶展|企画展|特別展/.test(value)) return 'exhibition';
  if (/演劇|舞台|ミュージカル|芝居|公演|落語|バレエ/.test(value)) return 'theater';
  if (/コンサート|ライブ|音楽|演奏|吹奏楽/.test(value)) return 'music';
  if (/マルシェ|市場|マーケット|物産|フリマ/.test(value)) return 'market';
  if (/講座|講演|教室|ワークショップ|体験|観察|ヨガ/.test(value)) return 'workshop';
  if (/フェア|キャンペーン|ポップアップ|POP ?UP|販売|ショッピング/.test(value)) return 'shopping';
  if (/花火|祭|フェス|盆踊/.test(value)) return 'festival';
  return fallback;
}

function evidence(dateText, extra = {}) {
  const result = {};
  if (dateText) result.date = stripTags(dateText);
  for (const [key, value] of Object.entries(extra)) if (value) result[key] = stripTags(value);
  return Object.keys(result).length ? result : undefined;
}

function makeEvent({ sourceId, sourceName, sourceUrl, eventName, range, venueName, address, category, description, officialUrl, imageUrl, price, time, checkedAt, evidenceData }) {
  if (!eventName || !range?.startDate) return undefined;
  const endDate = range.endDate ?? range.startDate;
  const startAt = atDate(range.startDate, time?.startTime);
  const endAt = atDate(range.endDate ?? range.startDate, time?.endTime);
  const identity = [sourceId, eventName, range.startDate, endDate, venueName ?? '', address ?? '', officialUrl ?? '']
    .map((part) => String(part).normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s\u3000\p{P}\p{S}]+/gu, ''))
    .join('|');
  const event = {
    id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
    eventName: stripTags(eventName),
    ...(venueName ? { venueName: stripTags(venueName) } : {}),
    category: category ?? categoryFor(eventName),
    ...(description ? { description: stripTags(description) } : {}),
    ...(address ? { address: stripTags(address) } : {}),
    startDate: range.startDate,
    endDate,
    ...(time?.startTime ? { startTime: time.startTime } : {}),
    ...(time?.endTime ? { endTime: time.endTime } : {}),
    ...(startAt ? { startAt } : {}),
    ...(endAt ? { endAt } : {}),
    ...(price ? { price: stripTags(price) } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    source: sourceName,
    sourceUrl,
    lastCheckedAt: checkedAt,
    sourceId,
  };
  const sourceEvidence = evidence(range.sourceDateText, evidenceData);
  if (sourceEvidence) event.evidence = sourceEvidence;
  return event;
}

function isCurrent(event, now) {
  const today = osakaDate(now);
  return !event.endDate || event.endDate >= today;
}

function deduplicate(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = [event.eventName, event.startDate, event.endDate ?? '', event.venueName ?? '', event.address ?? '']
      .map((part) => String(part).normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s\u3000\p{P}\p{S}]+/gu, ''))
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceResult(events = [], errors = [], recognized = true) {
  return { events, errors, recognized };
}

function parseOsakaCityPage(html, { checkedAt, now, source }) {
  const events = [];
  const yearMatch = String(html).match(/イベント(?:（|\()[^\d]*(20\d{2})年/);
  const fallbackYear = Number(yearMatch?.[1]) || osakaYear(now);
  const topicPattern = /<a\b([^>]*?)>\s*<span\s+class=["'][^"']*event_topics_text[^"']*["'][\s\S]*?<\/a>/gi;
  for (const match of String(html).matchAll(topicPattern)) {
    const tag = match[1] ?? '';
    const href = absoluteUrl(attr(tag, 'href'), source.url);
    const inner = match[0];
    const dateText = textFromMatch(inner, /<span\s+class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const title = textFromMatch(inner, /<span\s+class=["'][^"']*\blink\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const range = parseDateRange(dateText, fallbackYear);
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      category: categoryFor(title),
      officialUrl: href,
      checkedAt,
      evidenceData: { url: href },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }

  // The city page also includes selected day items inline under the calendar.
  const dayPattern = /<div\s+class=["'][^"']*cal_day_wrap01[^"']*["'][^>]*>([\s\S]*?)(?=<div\s+class=["'][^"']*cal_day_wrap01|<\/body|$)/gi;
  for (const match of String(html).matchAll(dayPattern)) {
    const block = match[1];
    const dayText = textFromMatch(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const dayRange = parseDateRange(dayText, fallbackYear);
    const links = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
    for (const link of block.matchAll(links)) {
      if (!/<div\s+class=["'][^"']*cal_day_lower01/i.test(block)) continue;
      const href = absoluteUrl(attr(link[1], 'href'), source.url);
      const title = stripTags(link[2]);
      if (!href || !title || /イベントを全て見る/.test(title)) continue;
      const event = makeEvent({
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        eventName: title,
        range: dayRange,
        category: categoryFor(title),
        officialUrl: href,
        checkedAt,
        evidenceData: { url: href },
      });
      if (event && isCurrent(event, now)) events.push(event);
    }
  }
  return events;
}

function parseOsakaInfoPage(html, { checkedAt, now, source }) {
  const events = [];
  const itemPattern = /<li\b[^>]*>\s*<a\b([^>]*?)>([\s\S]*?)<\/a>\s*<\/li>/gi;
  for (const match of String(html).matchAll(itemPattern)) {
    const linkAttrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const href = absoluteUrl(attr(linkAttrs, 'href'), source.url);
    if (!href || !/event_detail\.html/i.test(href)) continue;
    let parsed;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    const startDate = parsed.searchParams.get('startDate') ?? '';
    const endDate = parsed.searchParams.get('endDate') ?? startDate;
    const range = parseDateRange(`${startDate}～${endDate}`, osakaYear(now));
    const title = textFromMatch(inner, /<strong\s+class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i);
    const area = textFromMatch(inner, /<span\s+class=["'][^"']*\barea\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const price = textFromMatch(inner, /<span\s+class=["'][^"']*\byen\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const image = textFromMatch(inner, /<img\b([^>]*)>/i);
    const imageUrl = absoluteUrl(attr(image, 'src'), source.url);
    const description = /詳細はホームページをご覧ください/.test(area) ? undefined : area;
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      venueName: description,
      category: categoryFor(title),
      description: undefined,
      officialUrl: href,
      imageUrl,
      price,
      checkedAt,
      evidenceData: { date: `${startDate}～${endDate}`, price },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

function parseOsakaArtMuseumPage(html, { checkedAt, now, source }) {
  const events = [];
  const venue = FIXED_VENUES.osakaArtMuseum;
  const cardPattern = /<a\b([^>]*class=["'][^"']*\bbook__intro\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(cardPattern)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const range = parseDateRange(`${attr(attrs, 'data-start')}～${attr(attrs, 'data-end')}`, osakaYear(now));
    const title = textFromMatch(inner, /<div\s+class=["'][^"']*\bname__exhibit\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const image = textFromMatch(inner, /<img\b([^>]*)>/i);
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      venueName: venue.venueName,
      address: venue.address,
      category: 'exhibition',
      officialUrl: absoluteUrl(attr(attrs, 'href'), source.url),
      imageUrl: absoluteUrl(attr(image, 'src'), source.url),
      checkedAt,
      evidenceData: { date: textFromMatch(inner, /<span[^>]*>([^<]*20\d{2}[^<]*)<\/span>/i) },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

function parseNakkaMuseumPage(html, { checkedAt, now, source }) {
  const events = [];
  const venue = FIXED_VENUES.nakkaMuseum;
  const cardPattern = /<div\s+class=["']li["'][^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<div\s+class=["']post-detail-box["']>([\s\S]*?)<\/div>\s*<\/div>/gi;
  for (const match of String(html).matchAll(cardPattern)) {
    const imageAttrs = match[1] ?? '';
    const imageInner = match[2] ?? '';
    const detail = match[3] ?? '';
    const title = textFromMatch(detail, /<p\s+class=["']p2["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/p>/i);
    const dateText = textFromMatch(detail, /<p\s+class=["']p3["'][^>]*>([\s\S]*?)<\/p>/i);
    const range = parseDateRange(dateText, osakaYear(now));
    const image = textFromMatch(imageInner, /<img\b([^>]*)>/i);
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      venueName: venue.venueName,
      address: venue.address,
      category: 'exhibition',
      officialUrl: absoluteUrl(attr(imageAttrs, 'href'), source.url),
      imageUrl: absoluteUrl(attr(image, 'src'), source.url),
      checkedAt,
      evidenceData: { date: dateText },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

function extractTopLevelListItems(html, className) {
  const listStart = String(html).match(new RegExp(`<ul\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i'));
  if (!listStart || listStart.index === undefined) return [];
  const from = listStart.index + listStart[0].length;
  const source = String(html).slice(from);
  const tokens = /<\/?li\b[^>]*>/gi;
  let depth = 0;
  let start = -1;
  const items = [];
  for (const token of source.matchAll(tokens)) {
    const text = token[0];
    const index = token.index ?? 0;
    if (/^<li\b/i.test(text)) {
      depth += 1;
      if (depth === 1) start = index;
    } else {
      if (depth === 1 && start >= 0) items.push(source.slice(start, index + text.length));
      depth = Math.max(0, depth - 1);
      if (depth === 0) start = -1;
    }
  }
  return items;
}

function parseFestivalHallPage(html, { checkedAt, now, source }) {
  const events = [];
  const heading = String(html).match(/<h2\s+class=["']year-month["'][^>]*>\s*(20\d{2})年\s*<span\s+class=["']month["'][^>]*>\s*(\d{1,2})\s*<\/span>/i);
  const year = Number(heading?.[1]) || osakaYear(now);
  const month = Number(heading?.[2]);
  if (!month) return events;
  for (const item of extractTopLevelListItems(html, 'performance-list')) {
    const day = Number(textFromMatch(item, /<p\s+class=["']_date[^"']*["'][^>]*>\s*<span[^>]*>(\d{1,2})<\/span>/i));
    const title = textFromMatch(item, /<h2\s+class=["']_title["'][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i);
    if (!day || !title || /設備点検|仕込み|RESERVED/i.test(title)) continue;
    const date = validDate(year, month, day);
    const range = date ? { startDate: date, endDate: date, sourceDateText: `${year}年${month}月${day}日` } : undefined;
    const titleAnchor = item.match(/<h2\s+class=["']_title["'][^>]*>\s*<a\b([^>]*)>/i);
    const officialUrl = absoluteUrl(attr(titleAnchor?.[1] ?? '', 'href'), source.url);
    const timeText = textFromMatch(item, /<tr>\s*<th>\s*開演\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i);
    const price = textFromMatch(item, /<tr>\s*<th>\s*料金\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i);
    const image = textFromMatch(item, /<img\b([^>]*)>/i);
    const subTitle = textFromMatch(item, /<h3\s+class=["']_sub-title["'][^>]*>([\s\S]*?)<\/h3>/i);
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      venueName: FIXED_VENUES.festivalHall.venueName,
      address: FIXED_VENUES.festivalHall.address,
      category: 'music',
      description: subTitle,
      officialUrl,
      imageUrl: absoluteUrl(attr(image, 'src'), source.url),
      price,
      time: parseTimeRange(timeText),
      checkedAt,
      evidenceData: { date: `${year}年${month}月${day}日`, time: timeText, price },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

function parseAeonIndex(text, { checkedAt, now, source }) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const events = [];
  const venueNameBase = source.venueName || FIXED_VENUES.aeonOsakaDomeCity.venueName;
  const venueAddress = source.address || FIXED_VENUES.aeonOsakaDomeCity.address;
  for (const item of Array.isArray(parsed) ? parsed : (parsed?.events ?? [])) {
    if (!item || item.is_published === false) continue;
    const schedules = Array.isArray(item.event_calendar_schedules) ? item.event_calendar_schedules : [];
    const description = stripTags(item.body ?? '');
    const displayTime = stripTags(item.display_event_time ?? '');
    const officialUrl = absoluteUrl(item.html_path || item.file_name, source.url);
    const attachment = item.attachments?.[0]?.attachment_path;
    const ranges = [];
    const fallbackYear = osakaYear(now);
    // start_time/end_time are CMS publication/visibility timestamps on some
    // AEON pages.  Never use them as event dates unless the official payload
    // explicitly provides structured dates.
    if (item.structured_start_date || item.structured_end_date) {
      const startDate = item.structured_start_date || item.structured_end_date;
      const endDate = item.structured_end_date || item.structured_start_date || startDate;
      const range = parseDateRange(`${startDate ?? ''}～${endDate ?? ''}`, fallbackYear);
      if (range) ranges.push(range);
    } else if (schedules.length) {
      // Calendar schedules may be discrete dates.  Emit one record per
      // schedule instead of turning gaps into a fictitious continuous period.
      for (const schedule of schedules) {
        const range = parseDateRange(`${schedule.calendar_start_date ?? ''}～${schedule.calendar_end_date ?? schedule.calendar_start_date ?? ''}`, fallbackYear);
        if (range) ranges.push(range);
      }
    } else {
      const displayDate = stripTags(item.display_event_date ?? '');
      // Entries such as "毎月5日" or "6月6日・7日・12日〜14日" do not carry
      // one unambiguous interval.  Keep them out until a structured schedule
      // is published instead of guessing a date or merging discrete dates.
      if (!displayDate || /[・、,]/.test(displayDate)) continue;
      const range = parseDateRange(displayDate, fallbackYear);
      if (range) ranges.push(range);
    }
    if (!ranges.length) continue;
    for (const range of ranges) {
      const event = makeEvent({
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        eventName: item.title_oneline || item.title,
        range,
        venueName: item.display_event_place ? `${venueNameBase} ${stripTags(item.display_event_place)}` : venueNameBase,
        address: venueAddress,
        category: categoryFor(`${item.title ?? ''} ${description}`, 'shopping'),
        description,
        officialUrl,
        imageUrl: absoluteUrl(attachment, source.url),
        time: parseTimeRange(displayTime),
        checkedAt,
        evidenceData: { date: item.display_event_date, time: displayTime, venue: item.display_event_place },
      });
      if (event && isCurrent(event, now)) events.push(event);
    }
  }
  return events;
}

function hankyuDateFragment(detailHtml) {
  const firstParagraph = detailHtml.match(/<p\b[^>]*>\s*◎([\s\S]*?)<\/p>/i);
  return firstParagraph ? stripTags(firstParagraph[1]) : stripTags(detailHtml);
}

function parseHankyuPage(html, { checkedAt, now, source }) {
  const events = [];
  // Commented-out links on the official page are intentionally ignored. They
  // are not reliable event destinations and often refer to a previous season.
  const cleanHtml = String(html).replace(/<!--[\s\S]*?-->/g, ' ');
  const blockPattern = /<div\s+class=["']o-event["']\s+data-place=["']([^"']*)["'][^>]*>([\s\S]*?)<\/article>/gi;
  for (const match of cleanHtml.matchAll(blockPattern)) {
    const place = match[1]?.trim() ?? '';
    const block = match[2] ?? '';
    const title = textFromMatch(block, /<p\s+class=["'][^"']*\bo-event__title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    if (!title) continue;
    const detailHtml = textFromMatch(block, /<div\s+class=["'][^"']*\bo-event__detail\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const primary = hankyuDateFragment(detailHtml || block);
    const range = parseDateRange(primary, osakaYear(now));
    const image = textFromMatch(block, /<img\b([^>]*)>/i);
    const firstLink = block.match(/<a\b([^>]*)>/i);
    const officialUrl = absoluteUrl(attr(firstLink?.[1] ?? '', 'href'), source.url) ?? source.url;
    // The first "◎" line is the date.  Select a later line that starts with
    // the department-store floor marker instead of accidentally storing the
    // date range as the venue name.
    const explicitPlaceLine = detailHtml.split(/\n+/).find((line) => /^◎\s*(?:地下|\d+階)/.test(line.trim()));
    const explicitPlace = explicitPlaceLine?.replace(/^◎\s*/, '').trim();
    const venueName = explicitPlace ? `${FIXED_VENUES.hankyuUmeda.venueName} ${stripTags(explicitPlace)}` : `${FIXED_VENUES.hankyuUmeda.venueName} ${HANKYU_PLACE_NAMES[place] ?? ''}`.trim();
    const description = textFromMatch(block, /<p\s+class=["'][^"']*\bo-event__desc\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const time = parseTimeRange(primary);
    const event = makeEvent({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      eventName: title,
      range,
      venueName,
      address: FIXED_VENUES.hankyuUmeda.address,
      category: categoryFor(`${title} ${description}`, 'shopping'),
      description,
      officialUrl,
      imageUrl: absoluteUrl(attr(image, 'src'), source.url),
      time,
      checkedAt,
      evidenceData: { date: primary, venue: explicitPlace ?? HANKYU_PLACE_NAMES[place], time: time?.sourceTimeText },
    });
    if (event && isCurrent(event, now)) events.push(event);
  }
  return events;
}

async function collectOsakaInfo({ fetchText, checkedAt, now, source }) {
  const events = [];
  const errors = [];
  let first;
  try {
    first = await fetchText(`${OSAKA_INFO_API}?page=1`);
  } catch (error) {
    return sourceResult([], [`page=1: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const firstText = typeof first === 'string' ? first : String(first ?? '');
  events.push(...parseOsakaInfoPage(firstText, { checkedAt, now, source }));
  const pageCount = Math.max(1, Number(firstText.match(/(\d+)\s*ページ中/)?.[1] ?? 1));
  const pageSignatures = new Set();
  const pageSignature = (html) => [...String(html).matchAll(/event_detail\.html[^"'<>\s]*/gi)]
    .map((match) => match[0])
    .join('|');
  const firstSignature = pageSignature(firstText);
  if (firstSignature) pageSignatures.add(firstSignature);
  for (let page = 2; page <= pageCount; page += 1) {
    try {
      const html = await fetchText(`${OSAKA_INFO_API}?page=${page}`);
      const pageText = typeof html === 'string' ? html : String(html ?? '');
      const signature = pageSignature(pageText);
      // Stop when the endpoint repeats a page instead of spinning through a
      // broken pagination loop.  The declared tail was not fetched, so keep
      // a warning in the source report rather than presenting partial data as
      // a fully successful collection.
      if (signature && pageSignatures.has(signature)) {
        errors.push(`page=${page}: repeated response; stopped before declared final page`);
        break;
      }
      if (signature) pageSignatures.add(signature);
      events.push(...parseOsakaInfoPage(pageText, { checkedAt, now, source }));
    } catch (error) {
      errors.push(`page=${page}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return sourceResult(events, errors, /class=["'][^"']*list_parts|id=["']js-result["']|event_number/i.test(firstText));
}

const SOURCE_DEFINITIONS = [
  {
    id: 'osaka-city-events',
    name: '大阪市公式イベント',
    url: SOURCE_URLS.osakaCity,
    collect: async (context) => {
      const html = await context.fetchText(SOURCE_URLS.osakaCity);
      return sourceResult(parseOsakaCityPage(html, { ...context, source: SOURCE_DEFINITIONS[0] }), [], /event_topics_text|cal_day_wrap01/i.test(html));
    },
  },
  {
    id: 'osaka-info-events',
    name: 'OSAKA-INFO（大阪観光局）',
    url: SOURCE_URLS.osakaInfo,
    collect: (context) => collectOsakaInfo({ ...context, source: SOURCE_DEFINITIONS[1] }),
  },
  {
    id: 'osaka-art-museum',
    name: '大阪市立美術館',
    url: SOURCE_URLS.osakaArtMuseum,
    collect: async (context) => {
      const html = await context.fetchText(SOURCE_URLS.osakaArtMuseum);
      return sourceResult(parseOsakaArtMuseumPage(html, { ...context, source: SOURCE_DEFINITIONS[2] }), [], /book__intro/i.test(html));
    },
  },
  {
    id: 'nakka-art-museum',
    name: '大阪中之島美術館',
    url: SOURCE_URLS.nakkaMuseum,
    collect: async (context) => {
      const html = await context.fetchText(SOURCE_URLS.nakkaMuseum);
      return sourceResult(parseNakkaMuseumPage(html, { ...context, source: SOURCE_DEFINITIONS[3] }), [], /post-detail-box|class=["']li["']/i.test(html));
    },
  },
  {
    id: 'festival-hall',
    name: 'フェスティバルホール',
    url: SOURCE_URLS.festivalHall,
    collect: async (context) => {
      const html = await context.fetchText(SOURCE_URLS.festivalHall);
      return sourceResult(parseFestivalHallPage(html, { ...context, source: SOURCE_DEFINITIONS[4] }), [], /performance-list|year-month/i.test(html));
    },
  },
  {
    id: 'aeon-osaka-dome-city',
    name: 'イオンモール大阪ドームシティ',
    url: SOURCE_URLS.aeonOsakaDomeCity,
    collect: async (context) => {
      const text = await context.fetchText(AEON_INDEX);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return sourceResult([], ['index.json is not valid JSON'], false);
      }
      return sourceResult(parseAeonIndex(parsed, { ...context, source: SOURCE_DEFINITIONS[5] }), [], Array.isArray(parsed?.events) || Array.isArray(parsed));
    },
  },
  {
    id: 'hankyu-umeda',
    name: '阪急うめだ本店',
    url: SOURCE_URLS.hankyuUmeda,
    collect: async (context) => {
      const html = await context.fetchText(SOURCE_URLS.hankyuUmeda);
      return sourceResult(parseHankyuPage(html, { ...context, source: SOURCE_DEFINITIONS[6] }), [], /o-event\b/i.test(html));
    },
  },
];

function createAeonSourceDefinition(config) {
  const source = {
    id: config.id,
    name: config.name,
    url: config.url,
    venueName: config.venueName,
    address: config.address,
  };
  return {
    id: config.id,
    name: config.name,
    url: config.url,
    collect: async (context) => {
      const text = await context.fetchText(config.indexUrl);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return sourceResult([], ['index.json is not valid JSON'], false);
      }
      return sourceResult(parseAeonIndex(parsed, { ...context, source }), [], Array.isArray(parsed?.events) || Array.isArray(parsed));
    },
  };
}

// Keep the original source ordering stable for reports and append the other
// Osaka stores verified from the official AEON directory, followed by the
// museum and independent live-venue adapters.
SOURCE_DEFINITIONS.push(
  ...AEON_SOURCE_CONFIGS.slice(1).map(createAeonSourceDefinition),
  ...CULTURAL_SOURCE_DEFINITIONS,
);

export const ADDITIONAL_SOURCE_DEFINITIONS = SOURCE_DEFINITIONS.map(({ id, name, url }) => ({ id, name, url }));

/**
 * Collect current/future events from the additional official sources.
 *
 * @param {{fetchText: (url: string) => Promise<string>, now?: Date}} options
 * @returns {Promise<{events: object[], sources: object[]}>}
 */
export async function collectAdditionalEvents({ fetchText, now = new Date() } = {}) {
  if (typeof fetchText !== 'function') throw new TypeError('collectAdditionalEvents requires fetchText(url)');
  const checkedAt = checkedAtFor(now);
  const context = { fetchText, now, checkedAt };
  const allEvents = [];
  const sources = [];
  for (const definition of SOURCE_DEFINITIONS) {
    let result;
    try {
      result = await definition.collect(context);
    } catch (error) {
      result = sourceResult([], [error instanceof Error ? error.message : String(error)]);
    }
    const currentEvents = deduplicate((result?.events ?? []).filter((event) => isCurrent(event, now)));
    allEvents.push(...currentEvents);
    const errors = result?.errors ?? [];
    let status = 'success';
    if (!result?.recognized) {
      status = 'error';
      if (!errors.length) errors.push('known source markup or payload was not recognized');
    } else if (errors.length && !currentEvents.length) status = 'error';
    else if (errors.length) status = 'stale';
    else if (!currentEvents.length) status = 'stale';
    sources.push({
      id: definition.id,
      name: definition.name,
      url: definition.url,
      status,
      count: currentEvents.length,
      checkedAt,
      ...(errors.length ? { error: errors.join('; ') } : {}),
    });
  }
  return { events: deduplicate(allEvents), sources };
}

// Exporting parsers keeps source fixtures independently testable without
// making them part of the collector's runtime contract.
export const __test__ = Object.freeze({
  parseDateRange,
  parseTimeRange,
  categoryFor,
  parseOsakaCityPage,
  parseOsakaInfoPage,
  parseOsakaArtMuseumPage,
  parseNakkaMuseumPage,
  parseFestivalHallPage,
  parseAeonIndex,
  parseHankyuPage,
  ...culturalTest,
});
