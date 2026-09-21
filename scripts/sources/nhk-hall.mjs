import { eventCategory, normalizeDate, normalizeEventRecord } from '../lib/events.mjs';

export const NHK_HALL_URL = 'https://www.nhk-osakahall.jp/event/';
const SOURCE = Object.freeze({ id: 'nhk-osaka-hall', name: 'NHK大阪ホール', url: NHK_HALL_URL });
const ADDRESS = '大阪市中央区大手前4丁目1番20号';

function plain(value = '') {
  return String(value).replace(/<br\s*\/?>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&amp;/giu, '&').replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/\s+/gu, ' ').trim();
}

export function parseNhkHallPage(html, { checkedAt, source = SOURCE } = {}) {
  const events = [];
  const headings = [...String(html).matchAll(/<h2\b[^>]*class=["']eventh2["'][^>]*>\s*(20\d{2})年(\d{1,2})月\s*<\/h2>/giu)];
  for (let index = 0; index < headings.length; index += 1) {
    const [, year, month] = headings[index];
    const section = String(html).slice(headings[index].index, headings[index + 1]?.index ?? undefined);
    for (const row of section.matchAll(/<tr\b[^>]*class=["'][^"']*\bevent_timer\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/giu)) {
      const dateCell = row[1].match(/<td\b[^>]*class=["']td_eventDT["'][^>]*>([\s\S]*?)<\/td>/iu)?.[1] ?? '';
      const day = plain(dateCell.match(/<strong>(\s*[０-９\d]{1,2}\s*)<\/strong>/iu)?.[1]).normalize('NFKC');
      const title = plain(row[1].match(/<p\b[^>]*class=["']fxl["'][^>]*>\s*<strong>([\s\S]*?)<\/strong>/iu)?.[1]);
      const date = normalizeDate(`${year}-${month}-${day}`);
      if (!date || !title || /(?:中止|延期|払い戻し|休館)/u.test(title)) continue;
      const timeText = plain(dateCell).normalize('NFKC');
      const time = timeText.match(/開演\s*(\d{1,2}):([0-5]\d)/u);
      const startTime = time && Number(time[1]) <= 23 ? `${time[1].padStart(2, '0')}:${time[2]}` : undefined;
      events.push(normalizeEventRecord({
        eventName: title,
        venueName: SOURCE.name,
        address: ADDRESS,
        category: eventCategory(title),
        startDate: date,
        endDate: date,
        ...(startTime ? { startTime } : {}),
        officialUrl: NHK_HALL_URL,
        evidence: { date: `${year}年${month}月${day}日`, venue: SOURCE.name, url: NHK_HALL_URL },
        fieldEvidence: {
          date: { text: `${year}年${month}月${day}日`, sourceUrl: NHK_HALL_URL, checkedAt },
          venue: { text: SOURCE.name, sourceUrl: NHK_HALL_URL, checkedAt },
          ...(startTime ? { time: { text: timeText, sourceUrl: NHK_HALL_URL, checkedAt } } : {}),
        },
      }, { sourceId: source.id, sourceName: source.name, sourceUrl: source.url, checkedAt }));
    }
  }
  return events;
}

async function collectNhkHall({ fetchText, checkedAt }) {
  const html = await fetchText(NHK_HALL_URL);
  return { events: parseNhkHallPage(html, { checkedAt }), errors: [], recognized: /class=["']eventh2["']/u.test(html) && /class=["']td_eventDT["']/u.test(html) };
}

export const NHK_HALL_SOURCE_DEFINITIONS = Object.freeze([{ ...SOURCE, collect: collectNhkHall }]);
export const __test__ = Object.freeze({ parseNhkHallPage });
