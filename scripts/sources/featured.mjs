import {
  classifyTags,
  eventCategory,
  normalizeDate,
  normalizeEventRecord,
  normalizeTime,
  validDateRange,
} from '../lib/events.mjs';

const OSAKA_TIME_ZONE = 'Asia/Tokyo';

/**
 * First-party pages for high-interest exhibitions and the large ATC venue.
 *
 * The ATC page exposes the event list as a JSON `preload` value in the HTML
 * sent to every visitor. We intentionally consume that public response only;
 * the page's nonce-protected REST endpoint is not guessed or called here.
 */
export const FEATURED_SOURCE_URLS = Object.freeze({
  ghibliParkOsaka: 'https://ghiblipark-exhibition.jp/osaka/index.html',
  atcEvents: 'https://www.atc-co.com/event/',
  atcAccess: 'https://www.atc-co.com/guide/access/',
});

const GHIBLI_PARK_OSAKA = FEATURED_SOURCE_URLS.ghibliParkOsaka;
const ATC_EVENTS = FEATURED_SOURCE_URLS.atcEvents;
const ATC_ADDRESS = '〒559-0034 大阪市住之江区南港北2-1-10';
const GHIBLI_VENUE = '大阪南港ＡＴＣギャラリー';

function normalizeDigits(value = '') {
  return String(value)
    .replace(/[０-９]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[：﹕]/gu, ':')
    .replace(/[〜～]/gu, '～')
    .replace(/\u00a0/gu, ' ');
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([\da-f]+);?/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function stripTags(value = '') {
  return decodeEntities(String(value)
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/p\s*>/giu, '\n')
    .replace(/<\/li\s*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/[\t\r ]+/gu, ' ')
    .replace(/\n+/gu, '\n')
    .trim();
}

function textValue(value) {
  return stripTags(value).normalize('NFKC').trim();
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(tag).match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'iu'));
  return match ? decodeEntities(match[1]) : '';
}

function absoluteUrl(value, base) {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate, base);
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

function isCurrent(endDate, now) {
  return endDate >= osakaDate(now);
}

function parseJapaneseDateRange(value, fallbackYear) {
  const sourceText = textValue(normalizeDigits(value));
  if (!sourceText) return undefined;
  const tokens = [...sourceText.matchAll(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu)];
  if (tokens.length < 2) return undefined;
  const startYear = Number(tokens[0][1] ?? fallbackYear);
  const endYear = Number(tokens[1][1] ?? startYear);
  const startDate = normalizeDate(`${startYear}-${tokens[0][2]}-${tokens[0][3]}`);
  let endDate = normalizeDate(`${endYear}-${tokens[1][2]}-${tokens[1][3]}`);
  if (!startDate || !endDate) return undefined;
  if (!tokens[1][1] && endDate < startDate) {
    endDate = normalizeDate(`${endYear + 1}-${tokens[1][2]}-${tokens[1][3]}`);
  }
  const range = validDateRange(startDate, endDate);
  return range ? { ...range, sourceDateText: sourceText } : undefined;
}

function parseAtcDateRange(startValue, endValue, sourceDateText) {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue || startValue);
  const range = validDateRange(startDate, endDate);
  return range ? { ...range, sourceDateText: textValue(sourceDateText) || `${startDate}～${endDate}` } : undefined;
}

function parseTimeRange(value) {
  const sourceTimeText = textValue(normalizeDigits(value)).replace(/\s+/gu, ' ');
  if (!sourceTimeText) return undefined;
  const match = sourceTimeText.match(/(\d{1,2}):(\d{2})\s*[～~\-–—]\s*(\d{1,2}):(\d{2})/u);
  if (match) {
    const startTime = normalizeTime(`${match[1]}:${match[2]}`);
    const endTime = normalizeTime(`${match[3]}:${match[4]}`);
    if (startTime || endTime) return { startTime, endTime, sourceTimeText };
  }
  const single = sourceTimeText.match(/(\d{1,2}):(\d{2})/u);
  const startTime = single ? normalizeTime(`${single[1]}:${single[2]}`) : undefined;
  return startTime ? { startTime, sourceTimeText } : undefined;
}

function lineCandidates(value) {
  return stripTags(value)
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function firstClassText(html, className) {
  const expression = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'iu');
  const match = String(html).match(expression);
  return match ? stripTags(match[2]) : '';
}

function labelledParagraph(html, labelExpression) {
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/giu;
  for (const match of String(html).matchAll(itemPattern)) {
    const item = match[1] ?? '';
    const heading = item.match(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/iu);
    if (!heading || !labelExpression.test(stripTags(heading[1]))) continue;
    const paragraph = item.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu);
    if (paragraph) return stripTags(paragraph[1]);
  }
  return '';
}

function firstAddress(value) {
  const match = textValue(value).match(/〒?\s*559[-ー－]?0034\s*(?:大阪(?:府|市)?[\s\S]*?南港北)\s*2\s*[-ー－]\s*1\s*[-ー－]\s*10/u);
  return match ? ATC_ADDRESS : undefined;
}

function makeEvent({ source, eventName, range, venueName, address, description, price, time, officialUrl, imageUrl, checkedAt, audience }) {
  if (!source || !eventName || !range?.startDate || !range?.endDate || !officialUrl) return undefined;
  const cleanName = textValue(eventName);
  const cleanDescription = textValue(description);
  const cleanPrice = textValue(price);
  const cleanVenue = textValue(venueName);
  const tags = classifyTags({
    name: cleanName,
    description: cleanDescription,
    price: cleanPrice,
    audience,
  });
  const event = normalizeEventRecord({
    eventName: cleanName,
    venueName: cleanVenue,
    address: textValue(address),
    category: eventCategory(cleanName, cleanDescription),
    description: cleanDescription,
    startDate: range.startDate,
    endDate: range.endDate,
    ...(time?.startTime ? { startTime: time.startTime } : {}),
    ...(time?.endTime ? { endTime: time.endTime } : {}),
    ...(cleanPrice ? { price: cleanPrice } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(tags.tags.length ? { tags: tags.tags, tagEvidence: tags.tagEvidence } : {}),
    sourceId: source.id,
    source: source.name,
    sourceUrl: source.url,
    lastCheckedAt: checkedAt,
    evidence: {
      date: range.sourceDateText,
      ...(cleanVenue ? { venue: cleanVenue } : {}),
      ...(textValue(address) ? { address: textValue(address) } : {}),
      ...(time?.sourceTimeText ? { time: time.sourceTimeText } : {}),
      url: officialUrl,
    },
  }, {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    checkedAt,
    sourceStatus: 'success',
  });
  return event;
}

/** Parse the dedicated Ghibli Park Exhibition Osaka page. */
export function parseGhibliParkPage(html, { checkedAt, now = new Date(), source } = {}) {
  const sourceDefinition = source ?? FEATURED_SOURCE_DEFINITIONS[0];
  const dateText = firstClassText(html, 'mv-date') || labelledParagraph(html, /会\s*期/u);
  const range = parseJapaneseDateRange(dateText, osakaYear(now));
  const title = labelledParagraph(html, /展覧会名/u) || textValue(html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]).replace(/\s*[｜|].*$/u, '');
  const venueText = labelledParagraph(html, /会\s*場/u) || firstClassText(html, 'mv-venue');
  const venueName = lineCandidates(venueText).find((line) => /Ａ?ＴＣギャラリー|ATCギャラリー/u.test(line));
  const address = firstAddress(venueText);
  const timeText = labelledParagraph(html, /開場時間/u);
  const parsedTime = parseTimeRange(timeText);
  const hasFinalDayException = /9\s*月\s*26\s*日[\s\S]*?(?:17\s*[:：]\s*00|17\s*時)/u.test(textValue(timeText));
  const time = hasFinalDayException && parsedTime
    ? { startTime: parsedTime.startTime, sourceTimeText: textValue(timeText) }
    : parsedTime;
  const intro = firstClassText(html, 'intro-text');
  const description = [intro, hasFinalDayException ? '通常は19:00まで。最終日9月26日は17:00まで（最終入場16:30）。' : ''].filter(Boolean).join(' ');
  const image = String(html).match(/<img\b([^>]*\b(?:alt=["']ジブリパーク展["']|src=["'][^"']*img_mv)[^>]*)>/iu);
  const imageUrl = absoluteUrl(attr(image?.[1] ?? '', 'src'), GHIBLI_PARK_OSAKA);
  if (!range || !title || !venueName || !address || !isCurrent(range.endDate, now)) return [];
  const event = makeEvent({
    source: sourceDefinition,
    eventName: title,
    range,
    venueName,
    address,
    description,
    time,
    officialUrl: GHIBLI_PARK_OSAKA,
    imageUrl,
    checkedAt,
    audience: description,
  });
  return event ? [event] : [];
}

/**
 * Extract a JSON assignment from a script without evaluating page JavaScript.
 * This keeps the ATC adapter deterministic and avoids executing provider code.
 */
function assignedJson(html, variableName) {
  const source = String(html);
  const marker = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*`, 'u').exec(source);
  if (!marker || marker.index === undefined) return undefined;
  let index = marker.index + marker[0].length;
  while (/\s/u.test(source[index] ?? '')) index += 1;
  if (source[index] !== '{' && source[index] !== '[') return undefined;
  const opening = source[index];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        const jsonText = source.slice(marker.index + marker[0].length, index + 1).trim();
        try {
          return JSON.parse(jsonText);
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function atcPayload(html) {
  const payload = assignedJson(html, 'atcEventList');
  return payload && Array.isArray(payload.preload) ? payload : undefined;
}

function atcDateRanges(item) {
  const sourceDateText = textValue(item.date_text) || `${item.date_ymd ?? ''}～${item.end_ymd ?? item.date_ymd ?? ''}`;
  if (Array.isArray(item.all_dates) && item.all_dates.length) {
    return item.all_dates
      .map((date) => parseAtcDateRange(date, date, sourceDateText))
      .filter(Boolean);
  }
  return [parseAtcDateRange(item.date_ymd, item.end_ymd, sourceDateText)].filter(Boolean);
}

function canonicalAtcVenue(eventName, location) {
  const venue = textValue(location);
  if (/ジブリパーク展/u.test(eventName) && /Ａ?ＴＣギャラリー|ATCギャラリー/u.test(venue)) return GHIBLI_VENUE;
  return venue;
}

/** Parse the public `atcEventList.preload` data embedded in ATC's page. */
export function parseAtcEventsPage(html, { checkedAt, now = new Date(), source } = {}) {
  const sourceDefinition = source ?? FEATURED_SOURCE_DEFINITIONS[1];
  const payload = atcPayload(html);
  if (!payload) return [];
  const events = [];
  for (const item of payload.preload) {
    if (!item || item.status === '終了') continue;
    const eventName = textValue(item.title);
    const officialUrl = absoluteUrl(item.url, ATC_EVENTS);
    const venueName = canonicalAtcVenue(eventName, item.location);
    if (!eventName || !officialUrl || !venueName) continue;
    const time = parseTimeRange(item.time_text);
    const imageUrl = absoluteUrl(item.thumbnail, ATC_EVENTS);
    for (const range of atcDateRanges(item)) {
      if (!isCurrent(range.endDate, now)) continue;
      const event = makeEvent({
        source: sourceDefinition,
        eventName,
        range,
        venueName,
        address: ATC_ADDRESS,
        price: item.fee,
        time,
        officialUrl,
        imageUrl,
        checkedAt,
        audience: eventName,
      });
      if (event) events.push(event);
    }
  }
  return events;
}

export function recognizesGhibliParkPage(html) {
  const source = String(html);
  return /class=["'][^"']*\bmv-date\b[^"']*["']/iu.test(source)
    && /class=["'][^"']*\bmv-venue\b[^"']*["']/iu.test(String(html))
    && /開催概要/u.test(source)
    && /Ａ?ＴＣギャラリー|ATCギャラリー/u.test(source)
    && /〒?\s*559[-ー－]?0034\s*大阪(?:府大阪市|市)?住之江区南港北/u.test(source);
}

export function recognizesAtcEventsPage(html) {
  return Boolean(atcPayload(html));
}

function sourceResult(events = [], errors = [], recognized = true) {
  return { events, errors, recognized };
}

export const FEATURED_SOURCE_DEFINITIONS = Object.freeze([
  {
    id: 'ghibli-park-exhibition-osaka',
    name: 'ジブリパーク展 大阪公式',
    url: GHIBLI_PARK_OSAKA,
    collect: async (context) => {
      const html = await context.fetchText(GHIBLI_PARK_OSAKA);
      return sourceResult(
        parseGhibliParkPage(html, { ...context, source: FEATURED_SOURCE_DEFINITIONS[0] }),
        [],
        recognizesGhibliParkPage(html),
      );
    },
  },
  {
    id: 'atc-events',
    name: 'ATC公式イベント一覧',
    url: ATC_EVENTS,
    collect: async (context) => {
      const html = await context.fetchText(ATC_EVENTS);
      return sourceResult(
        parseAtcEventsPage(html, { ...context, source: FEATURED_SOURCE_DEFINITIONS[1] }),
        [],
        recognizesAtcEventsPage(html),
      );
    },
  },
]);

export const __test__ = Object.freeze({
  parseJapaneseDateRange,
  parseTimeRange,
  parseGhibliParkPage,
  parseAtcEventsPage,
  recognizesGhibliParkPage,
  recognizesAtcEventsPage,
  assignedJson,
  atcDateRanges,
});
