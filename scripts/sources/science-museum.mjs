import { eventCategory, normalizeDate, normalizeEventRecord } from '../lib/events.mjs';

export const SCIENCE_MUSEUM_URL = 'https://www.sci-museum.jp/event/';
const SOURCE = Object.freeze({ id: 'science-museum', name: '大阪市立科学館', url: SCIENCE_MUSEUM_URL });
const ADDRESS = '〒530-0005 大阪市北区中之島4-2-1';

function plain(value = '') {
  return String(value).replace(/<br\s*\/?>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&amp;/giu, '&').replace(/&nbsp;/giu, ' ').replace(/\s+/gu, ' ').trim();
}

export function parseScienceMuseumPage(html, { checkedAt, source = SOURCE } = {}) {
  const clean = String(html).replace(/<!--[\s\S]*?-->/gu, '');
  const parts = clean.split(/<div\b[^>]*id=["']pl(\d+)["'][^>]*>/iu).slice(1);
  const events = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const id = parts[index];
    const block = parts[index + 1];
    const title = plain(block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/iu)?.[1]);
    const dateHtml = block.match(/<th\b[^>]*>\s*日時\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/iu)?.[1] ?? '';
    const dateText = plain(dateHtml).normalize('NFKC');
    const match = dateText.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/u);
    const date = match ? normalizeDate(`${match[1]}-${match[2]}-${match[3]}`) : undefined;
    if (!title || !date || /(?:募集|締切|中止|延期)/u.test(title)) continue;
    const time = dateText.match(/(?:^|\s)(\d{1,2}):([0-5]\d)\s*[~〜～-]/u);
    const startTime = time && Number(time[1]) <= 23 ? `${time[1].padStart(2, '0')}:${time[2]}` : undefined;
    const officialUrl = `${SCIENCE_MUSEUM_URL}#pl${id}`;
    const imageUrl = block.match(/<img\b[^>]*src=["'](https:\/\/www\.sci-museum\.jp\/wp-content\/uploads\/[^"']+)["']/iu)?.[1];
    events.push(normalizeEventRecord({
      eventName: title,
      venueName: SOURCE.name,
      address: ADDRESS,
      category: eventCategory(title),
      startDate: date,
      endDate: date,
      ...(startTime ? { startTime } : {}),
      officialUrl,
      ...(imageUrl ? { imageUrl, imageSource: '大阪市立科学館公式', imageSourceUrl: SCIENCE_MUSEUM_URL } : {}),
      evidence: { date: dateText, venue: SOURCE.name, url: officialUrl },
      fieldEvidence: {
        date: { text: dateText, sourceUrl: officialUrl, checkedAt },
        venue: { text: SOURCE.name, sourceUrl: SCIENCE_MUSEUM_URL, checkedAt },
      },
    }, { sourceId: source.id, sourceName: source.name, sourceUrl: source.url, checkedAt }));
  }
  return events;
}

async function collectScienceMuseum({ fetchText, checkedAt }) {
  const html = await fetchText(SCIENCE_MUSEUM_URL);
  return { events: parseScienceMuseumPage(html, { checkedAt }), errors: [], recognized: /id=["']pl\d+["']/u.test(html) && /<th[^>]*>\s*日時\s*<\/th>/u.test(html) };
}

export const SCIENCE_MUSEUM_SOURCE_DEFINITIONS = Object.freeze([{ ...SOURCE, collect: collectScienceMuseum }]);
export const __test__ = Object.freeze({ parseScienceMuseumPage });
