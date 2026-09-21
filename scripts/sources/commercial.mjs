import { eventCategory, normalizeDate, normalizeEventRecord, validDateRange } from '../lib/events.mjs';

export const COMMERCIAL_SOURCE_URLS = Object.freeze({
  grandFront: 'https://www.grandfront-osaka.jp/event/',
  nambaParks: 'https://nambaparks.com/event',
});

const GRAND_FRONT_NAME = 'グランフロント大阪';
const NAMBA_PARKS_NAME = 'なんばパークス';
const NAMBA_PARKS_ADDRESS = '〒556-0011 大阪市浪速区難波中2-10-70';

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([\da-f]+);?/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&times;/giu, '×')
    .replace(/&hellip;/giu, '…')
    .replace(/&rsquo;/giu, '’');
}

function stripTags(value = '') {
  return decodeEntities(String(value).replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();
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
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function officialUrl(value, base, expectedHost) {
  const url = absoluteUrl(value, base);
  if (!url) return undefined;
  try {
    return new URL(url).hostname === expectedHost ? url : undefined;
  } catch {
    return undefined;
  }
}

function isPromotion(title) {
  return /(?:クーポン|ポイントバック|会員証|会員限定|会員様向け|ご成約|採用|リクルーティング|友だち追加キャンペーン|シネトク)/u.test(title);
}

function makeEvent({ source, title, startDate, endDate, venueName, address, officialUrl: eventUrl, imageUrl, checkedAt, dateEvidence }) {
  const range = validDateRange(startDate, endDate);
  if (!title || !range || !venueName || !eventUrl || isPromotion(title)) return undefined;
  return normalizeEventRecord({
    eventName: title,
    venueName,
    ...(address ? { address } : {}),
    category: eventCategory(title),
    ...range,
    officialUrl: eventUrl,
    ...(imageUrl ? { imageUrl, imageSource: `${source.name}公式イベント一覧`, imageSourceUrl: source.url } : {}),
    evidence: { date: dateEvidence || `${range.startDate}〜${range.endDate}`, venue: venueName, url: eventUrl },
    fieldEvidence: {
      date: { text: dateEvidence || `${range.startDate}〜${range.endDate}`, sourceUrl: source.url, checkedAt },
      venue: { text: venueName, sourceUrl: source.url, checkedAt },
    },
  }, {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    checkedAt,
  });
}

export function parseGrandFrontPage(html, { checkedAt, source } = {}) {
  const definition = source ?? COMMERCIAL_SOURCE_DEFINITIONS[0];
  const events = [];
  for (const match of String(html).matchAll(/<a\b([^>]*class=["'][^"']*\bcard-list-block\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/giu)) {
    const block = match[2];
    const title = stripTags(block.match(/<p\b[^>]*class=["'][^"']*\bcard-list-block__ttl\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1]);
    const place = stripTags(block.match(/<p\b[^>]*class=["'][^"']*\bcard-list-block__name\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1]);
    const times = [...block.matchAll(/<time\b([^>]*)>/giu)].map((entry) => normalizeDate(attr(entry[1], 'datetime'))).filter(Boolean);
    const eventUrl = officialUrl(attr(match[1], 'href'), definition.url, 'www.grandfront-osaka.jp');
    if (!eventUrl) continue;
    const imageTag = block.match(/<img\b([^>]*)>/iu)?.[1] ?? '';
    const imageUrl = absoluteUrl(attr(imageTag, 'src'), definition.url);
    const venueName = place && place !== GRAND_FRONT_NAME ? `${GRAND_FRONT_NAME} ${place}` : GRAND_FRONT_NAME;
    const event = makeEvent({
      source: definition,
      title,
      startDate: times[0],
      endDate: times[1] ?? times[0],
      venueName,
      officialUrl: eventUrl,
      imageUrl,
      checkedAt,
      dateEvidence: times.join('〜'),
    });
    if (event) events.push(event);
  }
  return events;
}

export function grandFrontPageCount(html) {
  const pages = [...String(html).matchAll(/href=["'][^"']*\/event\/\?page=(\d+)["']/giu)]
    .map((match) => Number(match[1])).filter((page) => Number.isInteger(page) && page >= 1 && page <= 20);
  return Math.max(1, ...pages);
}

export function parseNambaParksPage(html, { checkedAt, source } = {}) {
  const definition = source ?? COMMERCIAL_SOURCE_DEFINITIONS[1];
  const events = [];
  const blocks = String(html).split(/<div\b(?=[^>]*class=["']p-event__item["'])([^>]*)>/iu).slice(1);
  for (let index = 0; index + 1 < blocks.length; index += 2) {
    const attrs = blocks[index];
    const block = blocks[index + 1];
    const title = stripTags(block.match(/<p\b[^>]*class=["'][^"']*\bp-event__item-heading\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1]);
    const startDate = normalizeDate(attr(attrs, 'data-start').replaceAll('/', '-'));
    const endDate = normalizeDate((attr(attrs, 'data-end') || attr(attrs, 'data-start')).replaceAll('/', '-'));
    const eventUrl = officialUrl(block.match(/<a\b([^>]*)>/iu)?.[1] ? attr(block.match(/<a\b([^>]*)>/iu)[1], 'href') : '', definition.url, 'nambaparks.com');
    const imageTag = block.match(/<img\b([^>]*)>/iu)?.[1] ?? '';
    const imageUrl = absoluteUrl(attr(imageTag, 'src'), definition.url);
    const event = makeEvent({
      source: definition,
      title,
      startDate,
      endDate,
      venueName: NAMBA_PARKS_NAME,
      address: NAMBA_PARKS_ADDRESS,
      officialUrl: eventUrl,
      imageUrl,
      checkedAt,
      dateEvidence: stripTags(block.match(/<div\b[^>]*class=["'][^"']*\bp-event__item-date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]),
    });
    if (event) events.push(event);
  }
  return events;
}

function sourceResult(events = [], errors = [], recognized = true) {
  return { events, errors, recognized };
}

export const COMMERCIAL_SOURCE_DEFINITIONS = Object.freeze([
  {
    id: 'grand-front',
    name: GRAND_FRONT_NAME,
    url: COMMERCIAL_SOURCE_URLS.grandFront,
    collect: async (context) => {
      const first = await context.fetchText(COMMERCIAL_SOURCE_URLS.grandFront);
      if (!/card-list-block__ttl/iu.test(first)) return sourceResult([], [], false);
      const events = parseGrandFrontPage(first, { ...context, source: COMMERCIAL_SOURCE_DEFINITIONS[0] });
      const totalPages = grandFrontPageCount(first);
      const signatures = new Set([events.map((event) => event.officialUrl).join('|')]);
      const errors = [];
      for (let page = 2; page <= totalPages; page += 1) {
        try {
          const html = await context.fetchText(`${COMMERCIAL_SOURCE_URLS.grandFront}?page=${page}`);
          if (!/card-list-block__ttl/iu.test(html)) {
            errors.push(`page=${page}: markup not recognized`);
            break;
          }
          const pageEvents = parseGrandFrontPage(html, { ...context, source: COMMERCIAL_SOURCE_DEFINITIONS[0] });
          const signature = pageEvents.map((event) => event.officialUrl).join('|');
          if (signature && signatures.has(signature)) {
            errors.push(`page=${page}: repeated response`);
            break;
          }
          if (signature) signatures.add(signature);
          events.push(...pageEvents);
        } catch (error) {
          errors.push(`page=${page}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return sourceResult(events, errors);
    },
  },
  {
    id: 'namba-parks',
    name: NAMBA_PARKS_NAME,
    url: COMMERCIAL_SOURCE_URLS.nambaParks,
    collect: async (context) => {
      const html = await context.fetchText(COMMERCIAL_SOURCE_URLS.nambaParks);
      return sourceResult(parseNambaParksPage(html, { ...context, source: COMMERCIAL_SOURCE_DEFINITIONS[1] }), [], /p-event__item-heading/iu.test(html) && /data-start=/iu.test(html));
    },
  },
]);

export const __test__ = Object.freeze({ parseGrandFrontPage, parseNambaParksPage, grandFrontPageCount });
