import {
  eventCategory,
  normalizeDate,
  normalizeEventRecord,
  validDateRange,
} from '../lib/events.mjs';

export const PARK_SOURCE_URLS = Object.freeze({
  expoPark: 'https://www.expo70-park.jp/events/',
  hirakataPark: 'https://www.hirakatapark.co.jp/topics/?p=event',
});

const EXPO_VENUE = '万博記念公園';
const EXPO_ADDRESS = '〒565-0826 大阪府吹田市千里万博公園';
const HIRAKATA_VENUE = 'ひらかたパーク';
const HIRAKATA_ADDRESS = '〒573-0054 大阪府枚方市枚方公園町1-1';

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
    .replace(/<[^>]+>/gu, ' '))
    .replace(/[\t\r ]+/gu, ' ')
    .replace(/\n+/gu, '\n')
    .trim();
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(tag).match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'iu'));
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

function compactDate(value) {
  const match = /^(20\d{2})(\d{2})(\d{2})$/u.exec(String(value ?? '').trim());
  return match ? normalizeDate(`${match[1]}-${match[2]}-${match[3]}`) : undefined;
}

function japaneseDateTokens(value) {
  return [...stripTags(value).matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu)]
    .map((match) => normalizeDate(`${match[1]}-${match[2]}-${match[3]}`))
    .filter(Boolean);
}

function expoRanges(value) {
  const text = stripTags(value);
  const dates = [...new Set(japaneseDateTokens(text))];
  if (!dates.length) return [];
  if (dates.length >= 2 && /から/u.test(text)) {
    const range = validDateRange(dates[0], dates[1]);
    return range ? [{ ...range, evidence: text }] : [];
  }
  return dates.map((date) => ({ startDate: date, endDate: date, evidence: text }));
}

function makeParkEvent({ source, eventName, venueName, address, range, officialUrl, imageUrl, checkedAt, schedule }) {
  if (!source || !eventName || !range || !officialUrl) return undefined;
  return normalizeEventRecord({
    eventName: stripTags(eventName),
    venueName,
    address,
    category: eventCategory(eventName),
    startDate: range.startDate,
    endDate: range.endDate,
    officialUrl,
    ...(imageUrl ? {
      imageUrl,
      imageSource: `${source.name}公式イベント一覧`,
      imageSourceUrl: source.url,
    } : {}),
    ...(schedule ? { schedule } : {}),
    evidence: {
      date: range.evidence,
      venue: venueName,
      address,
      url: officialUrl,
    },
    fieldEvidence: {
      venue: { text: venueName, sourceUrl: source.url, checkedAt },
      address: { text: address, sourceUrl: source.url, checkedAt },
      date: { text: range.evidence, sourceUrl: source.url, checkedAt },
    },
  }, {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    checkedAt,
    sourceStatus: 'success',
  });
}

function sectionSlice(html, startPattern, endPattern) {
  const source = String(html);
  const start = source.search(startPattern);
  if (start < 0) return '';
  const tail = source.slice(start);
  const end = tail.slice(1).search(endPattern);
  return end < 0 ? tail : tail.slice(0, end + 1);
}

export function parseExpoParkPage(html, { checkedAt, source } = {}) {
  const sourceDefinition = source ?? PARK_SOURCE_DEFINITIONS[0];
  const scope = sectionSlice(html, /<div\b[^>]*class=["'][^"']*module__park-and-sport-new-event/iu, /<\/div>\s*<!--\s*CSS\s*-->/iu);
  if (!scope) return [];
  const events = [];
  for (const match of scope.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)) {
    const block = match[1];
    const dateHtml = block.match(/<p\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1];
    const titleMatch = block.match(/<h1\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/h1>/iu);
    if (!dateHtml || !titleMatch) continue;
    const officialUrl = absoluteUrl(attr(titleMatch[1], 'href'), sourceDefinition.url);
    const imageTag = block.match(/<img\b([^>]*)>/iu)?.[1] ?? '';
    const imageUrl = absoluteUrl(attr(imageTag, 'data-src') || attr(imageTag, 'src'), sourceDefinition.url);
    for (const range of expoRanges(dateHtml)) {
      const event = makeParkEvent({
        source: sourceDefinition,
        eventName: titleMatch[2],
        venueName: EXPO_VENUE,
        address: EXPO_ADDRESS,
        range,
        officialUrl,
        imageUrl,
        checkedAt,
      });
      if (event) events.push(event);
    }
  }
  return events;
}

function hirakataBlocks(html) {
  const scope = sectionSlice(html, /<section\b[^>]*class=["'][^"']*topics__event\b/iu, /<section\b[^>]*class=["'][^"']*topics__pickup\b/iu);
  if (!scope) return [];
  return [...scope.matchAll(/<a\b([^>]*class=["'][^"']*\bevent__(?:main-link|link)\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/giu)]
    .map((match) => ({ anchor: match[1], body: match[2] }));
}

export function parseHirakataParkPage(html, { checkedAt, source } = {}) {
  const sourceDefinition = source ?? PARK_SOURCE_DEFINITIONS[1];
  const events = [];
  const seen = new Set();
  for (const { anchor, body } of hirakataBlocks(html)) {
    const title = body.match(/<h[34]\b[^>]*class=["'][^"']*\bevent__(?:main-title|title)\b[^"']*["'][^>]*>([\s\S]*?)<\/h[34]>/iu)?.[1];
    const scheduleTag = body.match(/<[^>]+\bdata-startday=["'][^"']+["'][^>]*>/iu)?.[0] ?? '';
    const startDate = compactDate(attr(scheduleTag, 'data-startday'));
    const endDate = compactDate(attr(scheduleTag, 'data-endday')) || startDate;
    const range = validDateRange(startDate, endDate);
    const officialUrl = absoluteUrl(attr(anchor, 'href'), sourceDefinition.url);
    if (!title || !range || !officialUrl) continue;
    const key = `${stripTags(title)}|${range.startDate}|${range.endDate}|${officialUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const imageTag = body.match(/<img\b([^>]*)>/iu)?.[1] ?? '';
    const imageUrl = absoluteUrl(attr(imageTag, 'data-src') || attr(imageTag, 'src'), sourceDefinition.url);
    const closedDates = attr(scheduleTag, 'data-holiday').split(',').map(compactDate).filter(Boolean);
    const evidence = stripTags(body.match(/<div\b[^>]*class=["'][^"']*\bevent__main-date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1])
      || `${range.startDate}〜${range.endDate}`;
    const event = makeParkEvent({
      source: sourceDefinition,
      eventName: title,
      venueName: HIRAKATA_VENUE,
      address: HIRAKATA_ADDRESS,
      range: { ...range, evidence },
      officialUrl,
      imageUrl,
      checkedAt,
      schedule: closedDates.length ? { closedDates, evidence: `休催日: ${closedDates.join(', ')}` } : undefined,
    });
    if (event) events.push(event);
  }
  return events;
}

function sourceResult(events = [], errors = [], recognized = true) {
  return { events, errors, recognized };
}

export const PARK_SOURCE_DEFINITIONS = Object.freeze([
  {
    id: 'expo-park',
    name: '万博記念公園',
    url: PARK_SOURCE_URLS.expoPark,
    collect: async (context) => {
      const html = await context.fetchText(PARK_SOURCE_URLS.expoPark);
      return sourceResult(
        parseExpoParkPage(html, { ...context, source: PARK_SOURCE_DEFINITIONS[0] }),
        [],
        /module__park-and-sport-new-event/iu.test(html) && /class=["'](?:event-box|sport-box)["']/iu.test(html),
      );
    },
  },
  {
    id: 'hirakata-park',
    name: 'ひらかたパーク',
    url: PARK_SOURCE_URLS.hirakataPark,
    collect: async (context) => {
      const html = await context.fetchText(PARK_SOURCE_URLS.hirakataPark);
      return sourceResult(
        parseHirakataParkPage(html, { ...context, source: PARK_SOURCE_DEFINITIONS[1] }),
        [],
        /topics__event/iu.test(html) && /data-startday=/iu.test(html),
      );
    },
  },
]);

export const __test__ = Object.freeze({
  parseExpoParkPage,
  parseHirakataParkPage,
  expoRanges,
  compactDate,
});
