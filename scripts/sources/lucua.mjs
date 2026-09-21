import { eventCategory, normalizeDate, normalizeEventRecord, validDateRange } from '../lib/events.mjs';

export const LUCUA_SOURCE_URLS = Object.freeze({
  events: 'https://www.lucua.jp/topics_category/event_info/',
  popup: 'https://www.lucua.jp/topics_category/popup/',
});

const SOURCE = Object.freeze({ id: 'lucua', name: 'ルクア大阪', url: LUCUA_SOURCE_URLS.events });

function stripTags(value = '') {
  return String(value)
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&#(\d+);?/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, ' ')
    .trim();
}

function officialLink(value) {
  try {
    const url = new URL(value, 'https://www.lucua.jp/');
    if (url.hostname !== 'www.lucua.jp' || url.protocol !== 'https:' || !/^\/topics\/p-\d+\.html$/u.test(url.pathname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function parseLucuaLinks(html) {
  const links = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/<article\b[^>]*class=["'][^"']*\btopics-archive-post\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/giu)) {
    const body = match[1];
    const href = body.match(/<a\b[^>]*href=["']([^"']+)["']/iu)?.[1];
    const url = officialLink(href);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  }
  return links;
}

export function parseLucuaDetail(html, { officialUrl, checkedAt, source = SOURCE } = {}) {
  if (!officialLink(officialUrl)) return undefined;
  const title = stripTags(String(html).match(/<h1\b[^>]*class=["'][^"']*\bentry-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const dateBlock = String(html).match(/<div\b[^>]*class=["']event-date["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1] ?? '';
  const tokens = [...stripTags(dateBlock).matchAll(/(20\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/gu)]
    .map((match) => normalizeDate(`${match[1]}-${match[2]}-${match[3]}`)).filter(Boolean);
  const range = validDateRange(tokens[0], tokens[1] ?? tokens[0]);
  if (!title || !range) return undefined;
  const image = String(html).match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/iu)?.[1];
  let imageUrl;
  try {
    const url = new URL(image);
    if (url.hostname === 'www.lucua.jp' || url.hostname === 'lucua.jp') {
      url.protocol = 'https:';
      imageUrl = url.href;
    }
  } catch { /* Image is optional. */ }
  return normalizeEventRecord({
    eventName: title,
    venueName: 'ルクア大阪',
    category: eventCategory(title),
    ...range,
    officialUrl,
    ...(imageUrl ? { imageUrl, imageSource: 'ルクア大阪公式', imageSourceUrl: source.url } : {}),
    evidence: { date: stripTags(dateBlock), venue: 'ルクア大阪', url: officialUrl },
    fieldEvidence: {
      date: { text: stripTags(dateBlock), sourceUrl: officialUrl, checkedAt },
      venue: { text: 'ルクア大阪', sourceUrl: source.url, checkedAt },
    },
  }, { sourceId: source.id, sourceName: source.name, sourceUrl: source.url, checkedAt });
}

async function collectLucua({ fetchText, checkedAt }) {
  const errors = [];
  const links = new Set();
  for (const [label, url] of Object.entries(LUCUA_SOURCE_URLS)) {
    try {
      const html = await fetchText(url);
      if (!/topics-archive-post/iu.test(html)) {
        errors.push(`${label}: listing markup not recognized`);
        continue;
      }
      for (const link of parseLucuaLinks(html)) links.add(link);
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!links.size) return { events: [], errors, recognized: false };
  const events = [];
  const urls = [...links].slice(0, 60);
  // Keep detail traffic bounded; each official page carries explicit years,
  // unlike the yearless dates displayed on listing cards.
  for (let offset = 0; offset < urls.length; offset += 3) {
    const batch = await Promise.all(urls.slice(offset, offset + 3).map(async (url) => {
      try {
        const html = await fetchText(url);
        return { event: parseLucuaDetail(html, { officialUrl: url, checkedAt }) };
      } catch (error) {
        return { error: `${url}: ${error instanceof Error ? error.message : String(error)}` };
      }
    }));
    for (const result of batch) {
      if (result.event) events.push(result.event);
      if (result.error) errors.push(result.error);
    }
  }
  return { events, errors, recognized: true };
}

export const LUCUA_SOURCE_DEFINITIONS = Object.freeze([{ ...SOURCE, collect: collectLucua }]);
export const __test__ = Object.freeze({ parseLucuaLinks, parseLucuaDetail });
