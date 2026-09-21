import { eventCategory, normalizeDate, normalizeEventRecord } from '../lib/events.mjs';

export const FENICE_URL = 'https://www.fenice-sacay.jp/event/';
const SOURCE = Object.freeze({ id: 'fenice-sakai', name: 'フェニーチェ堺', url: FENICE_URL });
const ADDRESS = '〒590-0061 堺市堺区翁橋町2-1-1';

function plain(value = '') {
  return String(value).replace(/<[^>]*>/gu, ' ').replace(/&amp;/giu, '&').replace(/&#(\d+);?/gu, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/gu, ' ').trim();
}

export function parseFenicePage(html, { checkedAt, source = SOURCE } = {}) {
  const events = [];
  for (const block of String(html).split(/<li\b[^>]*class=["']p-event__item["'][^>]*>/iu).slice(1)) {
    const card = block;
    const href = card.match(/<div\b[^>]*class=["']c-event_card["'][^>]*>\s*<a\b[^>]*href=["'](https:\/\/www\.fenice-sacay\.jp\/event\/\d+\/)['"]/iu)?.[1];
    const title = plain(card.match(/<div\b[^>]*class=["']c-pickup__title["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
    const place = plain(card.match(/location-dot-light\.svg[\s\S]{0,180}?<\/i>([^<]+)/iu)?.[1]);
    if (!href || !title || /(?:公演中止|開催中止|延期のお知らせ)/u.test(title) || !/^(?:大ホール|小ホール|多目的室|スタジオ|ガレリア|ロビー|リハーサル室|文化交流室|展示室|ホワイエ)/u.test(place)) continue;
    const dates = [...new Set([...card.matchAll(/(20\d{2})\.(\d{2})\.(\d{2})/gu)].map((match) => normalizeDate(`${match[1]}-${match[2]}-${match[3]}`)).filter(Boolean))];
    const imageUrl = card.match(/<img\b[^>]*src=["'](https:\/\/www\.fenice-sacay\.jp\/wp\/wp-content\/uploads\/[^"']+)["']/iu)?.[1];
    if (!dates.length) continue;
    dates.sort();
    events.push(normalizeEventRecord({
      eventName: title,
      venueName: `${SOURCE.name} ${place}`,
      address: ADDRESS,
      category: eventCategory(title),
      startDate: dates[0],
      endDate: dates.at(-1),
      ...(dates.length > 1 ? { schedule: { dates, evidence: '公式公演一覧の列挙日程' } } : {}),
      officialUrl: href,
      ...(imageUrl ? { imageUrl, imageSource: 'フェニーチェ堺公式', imageSourceUrl: FENICE_URL } : {}),
      evidence: { date: dates.join('、'), venue: place, url: href },
      fieldEvidence: {
        date: { text: dates.join('、'), sourceUrl: href, checkedAt },
        venue: { text: place, sourceUrl: FENICE_URL, checkedAt },
      },
    }, { sourceId: source.id, sourceName: source.name, sourceUrl: source.url, checkedAt }));
  }
  return events;
}

async function collectFenice({ fetchText, checkedAt }) {
  const events = [];
  const errors = [];
  let recognized = false;
  // The public list is ordered by publication, not performance date. Scan a
  // bounded window and use only the explicit performance dates on each card.
  for (let page = 1; page <= 10; page += 1) {
    try {
      const url = page === 1 ? FENICE_URL : `${FENICE_URL}page/${page}/`;
      const html = await fetchText(url);
      if (!/c-event_card/u.test(html)) {
        errors.push(`page=${page}: card markup not recognized`);
        break;
      }
      recognized = true;
      events.push(...parseFenicePage(html, { checkedAt }));
    } catch (error) {
      errors.push(`page=${page}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  return { events, errors, recognized };
}

export const FENICE_SOURCE_DEFINITIONS = Object.freeze([{ ...SOURCE, collect: collectFenice }]);
export const __test__ = Object.freeze({ parseFenicePage });
