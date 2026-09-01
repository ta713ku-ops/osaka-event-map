import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';

const SOURCE_URL = 'https://data.bodik.jp/dataset/388c34d1-f97a-4865-a547-8e89c53a364a/resource/a6f32430-9e39-49f7-b429-6e4eadcc96de/download/270008_event.csv';
const SOURCE_PAGE = 'https://data.bodik.jp/dataset/270008_event';
const CACHED_SOURCE = new URL('../data/sources/270008_event.csv', import.meta.url);
const OUTPUT = new URL('../public/data/events.json', import.meta.url);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some(Boolean))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　・\-—―]/g, '');
}

function eventCategory(name, description) {
  const text = `${name} ${description}`;
  if (/花火/.test(text)) return 'fireworks';
  if (/祭|フェス|盆踊/.test(text)) return 'festival';
  if (/マルシェ|市場|市$/.test(text)) return 'market';
  if (/フリマ|フリー.?マーケット/.test(text)) return 'fleaMarket';
  if (/展覧|展示|美術|写真展/.test(text)) return 'exhibition';
  if (/博物|資料館/.test(text)) return 'museum';
  if (/動物|いきもの|昆虫|水族|海の生き物/.test(text)) return 'zoo';
  if (/イルミ|ライトアップ/.test(text)) return 'illumination';
  if (/夜|ナイト|星空|天体/.test(text)) return 'night';
  if (/グルメ|飲食|キッチンカー|収穫|食/.test(text)) return 'food';
  if (/体験|教室|工作|講座|観察|実習|ヨガ|ウォーキング/.test(text)) return 'workshop';
  return 'seasonal';
}

function dateTime(date, time, end = false) {
  if (!/^\d{1,2}:\d{2}/.test(time ?? '')) return undefined;
  return `${date}T${time.slice(0, 5)}:00+09:00`;
}

function booleanOrNull(value, yesPattern) {
  if (!value) return null;
  if (yesPattern.test(value)) return true;
  if (/なし|不可|無/.test(value)) return false;
  return null;
}

function httpUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function toEvent(row, checkedAt) {
  const eventName = row['イベント名']?.trim();
  const startDate = row['開始日']?.trim();
  const endDate = row['終了日']?.trim() || startDate;
  const venueName = row['場所名称']?.trim() || row['集合（受付）場所']?.trim() || '大阪府内';
  const address = [
    row['所在地_都道府県'],
    row['所在地_市区町村'],
    row['所在地_町字'],
    row['所在地_番地以下'],
    row['建物名等(方書)'],
  ].filter(Boolean).join('');
  const latitude = Number(row['緯度']);
  const longitude = Number(row['経度']);
  if (!eventName || !startDate || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const identity = [eventName, startDate, venueName, address].map(normalize).join('|');
  const price = row['料金(基本)']?.trim() || undefined;
  const description = row['概要']?.trim() || row['説明']?.trim() || undefined;
  const category = eventCategory(eventName, description ?? '');
  const imageUrl = httpUrl(row['画像']);
  const imageLicense = row['画像_ライセンス']?.trim() || undefined;
  const startAt = dateTime(startDate, row['開始時間'] ?? '');
  let endAt = dateTime(endDate, row['終了時間'] ?? '');
  // A same-day event ending earlier than it starts is an overnight event.
  if (startAt && endAt && endDate === startDate && endAt <= startAt) {
    endAt = new Date(new Date(endAt).getTime() + 86400000).toISOString();
  }
  return {
    id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
    eventName,
    venueName,
    category,
    description,
    address,
    latitude,
    longitude,
    startDate,
    endDate,
    startTime: row['開始時間']?.trim() || undefined,
    endTime: row['終了時間']?.trim() || undefined,
    ...(startAt ? { startAt } : {}),
    ...(endAt ? { endAt } : {}),
    price,
    freeEvent: price ? /無料|なし|0円/.test(price) : null,
    indoor: /館|室内|ホール/.test(`${venueName} ${description ?? ''}`) ? true : null,
    outdoor: /公園|広場|森|里山|海|緑地/.test(`${venueName} ${description ?? ''}`) ? true : null,
    rainSupport: booleanOrNull(row['開催条件'], /雨天決行|雨天開催/),
    parking: booleanOrNull(row['駐車場情報'], /あり|有/),
    childFriendly: /子ども|こども|親子|家族|ちびっこ|キッズ|収穫|工作|観察/.test(`${eventName} ${description ?? ''}`),
    dateFriendly: /イルミ|花火|夜|ライトアップ|音楽|コンサート|マルシェ/.test(`${eventName} ${description ?? ''}`),
    officialUrl: row['コンテンツURL']?.trim() || row['URL']?.trim() || SOURCE_PAGE,
    source: '大阪府オープンデータ（BODIK）',
    sourceUrl: SOURCE_PAGE,
    ...(imageUrl ? {
      imageUrl,
      imageSource: '大阪府オープンデータ（BODIK）のイベントCSV「画像」欄',
      imageSourceUrl: SOURCE_PAGE,
      ...(imageLicense ? { imageLicense } : {}),
    } : {}),
    lastCheckedAt: checkedAt,
  };
}

function dedupe(events) {
  const found = new Map();
  for (const event of events) {
    const key = [event.eventName, event.startDate, event.venueName, event.address].map(normalize).join('|');
    if (!found.has(key)) found.set(key, event);
  }
  return [...found.values()];
}

async function loadSource() {
  if (process.argv.includes('--cached')) return readFile(CACHED_SOURCE, 'utf8');
  const response = await fetch(SOURCE_URL, { headers: { 'user-agent': 'osaka-event-map-prototype/0.1' } });
  if (!response.ok) throw new Error(`大阪府イベントCSVの取得に失敗しました: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const decoded = new TextDecoder('shift_jis').decode(bytes);
  await mkdir(new URL('../data/sources/', import.meta.url), { recursive: true });
  await writeFile(CACHED_SOURCE, decoded);
  return decoded;
}

const csv = await loadSource();
const checkedAt = process.argv.includes('--cached') ? (await stat(CACHED_SOURCE)).mtime.toISOString() : new Date().toISOString();
const todayInOsaka = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const events = dedupe(parseCsv(csv).map((row) => toEvent(row, checkedAt)).filter(Boolean))
  .filter((event) => event.endDate >= todayInOsaka)
  .sort((a, b) => (a.startAt ?? a.startDate).localeCompare(b.startAt ?? b.startDate))
  .slice(0, 50);

if (events.length < 30) throw new Error(`有効イベントが30件未満です: ${events.length}件`);

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: checkedAt,
  attribution: {
    name: '大阪府 イベント一覧',
    license: 'CC BY 4.0',
    sourceUrl: SOURCE_PAGE,
  },
  events,
}, null, 2)}\n`);

console.log(`大阪府公式イベント ${events.length}件を正規化・重複排除しました。`);
