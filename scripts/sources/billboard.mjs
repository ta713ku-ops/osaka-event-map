import { normalizeDate, normalizeEventRecord, validDateRange } from '../lib/events.mjs';

export const BILLBOARD_URL = 'https://www.billboard-live.com/osaka/schedules';
const SOURCE = Object.freeze({ id: 'billboard-osaka', name: 'ビルボードライブ大阪', url: BILLBOARD_URL });
const ADDRESS = '〒530-0001 大阪市北区梅田2丁目2番22号 ハービスPLAZA ENT B2';

function decode(value = '') {
  return String(value).replace(/&amp;/giu, '&').replace(/&quot;/giu, '"').replace(/&#x([\da-f]+);?/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);?/gu, (_, code) => String.fromCodePoint(Number(code)));
}

export function parseBillboardPage(html, { checkedAt, source = SOURCE } = {}) {
  const events = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/<a\b[^>]*class=["'][^"']*\bArtistCardFull_root__[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    let url;
    try {
      url = new URL(decode(match[1]), BILLBOARD_URL);
      if (url.hostname !== 'www.billboard-live.com' || url.pathname !== '/osaka/show') continue;
    } catch { continue; }
    const date = normalizeDate(url.searchParams.get('date'));
    const eventId = url.searchParams.get('event_id');
    const title = decode(match[2].match(/<h3\b[^>]*class=["'][^"']*\bEventHeading_mainTitle__[^"']*["'][^>]*aria-label=["']([^"']+)["']/iu)?.[1] ?? '').trim();
    if (!date || !validDateRange(date, date) || !/^ev-\d+$/u.test(eventId ?? '') || !title || /(?:中止|延期|休演|払い戻し|お知らせ)/u.test(title)) continue;
    const image = decode(match[2].match(/<img\b[^>]*src=["'](https:\/\/www\.billboard-live\.com\/public\/event_img\/[^"']+)["']/iu)?.[1] ?? '');
    const key = `${eventId}:${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(normalizeEventRecord({
      eventName: title,
      venueName: SOURCE.name,
      address: ADDRESS,
      category: 'music',
      startDate: date,
      endDate: date,
      officialUrl: url.href,
      ...(image ? { imageUrl: image, imageSource: 'ビルボードライブ大阪公式', imageSourceUrl: BILLBOARD_URL } : {}),
      evidence: { date, venue: SOURCE.name, url: url.href },
      fieldEvidence: {
        date: { text: date, sourceUrl: url.href, checkedAt },
        venue: { text: SOURCE.name, sourceUrl: 'https://www.billboard-live.com/osaka/info/access', checkedAt },
      },
    }, { sourceId: source.id, sourceName: source.name, sourceUrl: source.url, checkedAt }));
  }
  return events;
}

function monthsFrom(checkedAt, count = 6) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(checkedAt)).map(({ type, value }) => [type, value]));
  const first = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, 1));
  return Array.from({ length: count }, (_, offset) => {
    const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1));
    return `${month.getUTCFullYear()}${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

async function collectBillboard({ fetchText, checkedAt }) {
  const events = [];
  const errors = [];
  let recognized = false;
  for (const month of monthsFrom(checkedAt)) {
    try {
      const html = await fetchText(`${BILLBOARD_URL}?month=${month}`);
      if (!/ArtistCardFull_root__/u.test(html) && !/schedule-card-list/u.test(html)) {
        errors.push(`${month}: schedule markup not recognized`);
        continue;
      }
      recognized = true;
      events.push(...parseBillboardPage(html, { checkedAt }));
    } catch (error) {
      errors.push(`${month}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { events, errors, recognized };
}

export const BILLBOARD_SOURCE_DEFINITIONS = Object.freeze([{ ...SOURCE, collect: collectBillboard }]);
export const __test__ = Object.freeze({ parseBillboardPage, monthsFrom });
