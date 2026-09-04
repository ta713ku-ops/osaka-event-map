import { createHash } from 'node:crypto';

export const TAG_NAMES = Object.freeze(['celebrity', 'exhibition', 'family', 'free', 'limited']);

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parse the small, RFC 4180-compatible CSV dialect used by the official
 * public datasets.  Keeping this dependency-free makes collection tests
 * deterministic and avoids silently accepting malformed quoted records.
 */
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  let sawAny = false;

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
      sawAny = true;
      continue;
    }

    if (char === '"') {
      quoted = true;
      sawAny = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
      sawAny = true;
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
      sawAny = false;
    } else {
      value += char;
      if (char !== '\r') sawAny = true;
    }
  }

  if (quoted) throw new Error('CSVの引用符が閉じられていません');
  if (sawAny || value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headerRow, ...records] = rows;
  if (!headerRow?.length) return [];
  const headers = headerRow.map((header, index) => {
    const cleaned = String(header ?? '').trim();
    return cleaned || `column_${index + 1}`;
  });
  return records
    .filter((record) => record.some((item) => String(item ?? '').trim() !== ''))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

export function textValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').trim();
}

/** Identity normalization intentionally strips punctuation so source-specific
 * typography does not prevent cross-source duplicate detection. */
export function normalize(value) {
  return textValue(value)
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\u3000\p{P}\p{S}]+/gu, '');
}

export function normalizeDate(value) {
  const candidate = textValue(value).replaceAll('/', '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(candidate);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const canonical = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${canonical}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== canonical) return undefined;
  return canonical;
}

export function normalizeTime(value) {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  const match = TIME_RE.exec(candidate);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function validDateRange(startValue, endValue = startValue) {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue);
  if (!startDate || !endDate || endDate < startDate) return undefined;
  return { startDate, endDate };
}

export function parseCoordinate(value, axis) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    if (Object.is(value, -0)) return 0;
    const numeric = value;
    if (axis === 'latitude' && (numeric < -90 || numeric > 90)) return undefined;
    if (axis === 'longitude' && (numeric < -180 || numeric > 180)) return undefined;
    return numeric;
  }
  const candidate = textValue(value).replace(',', '.');
  if (!candidate || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(candidate)) return undefined;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric)) return undefined;
  if (axis === 'latitude' && (numeric < -90 || numeric > 90)) return undefined;
  if (axis === 'longitude' && (numeric < -180 || numeric > 180)) return undefined;
  return numeric;
}

export function validCoordinates(latitudeValue, longitudeValue) {
  const latitude = parseCoordinate(latitudeValue, 'latitude');
  const longitude = parseCoordinate(longitudeValue, 'longitude');
  // (0, 0) is a common missing-coordinate placeholder and is not a useful
  // Osaka map location.  Keep the event, but omit the entire coordinate pair.
  if (latitude === undefined || longitude === undefined || (latitude === 0 && longitude === 0)) return undefined;
  return { latitude, longitude };
}

export function dateTime(dateValue, timeValue) {
  const date = normalizeDate(dateValue);
  const time = normalizeTime(timeValue);
  return date && time ? `${date}T${time}:00+09:00` : undefined;
}

export function httpUrl(value) {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function hasNegativeCue(text, expression) {
  return text.split(/[。！？\n]/u).some((sentence) => (
    expression.test(sentence) && /(?:ありません|ではありません|ではない|でない|ない|しない|しません|なし|不在|対象外|不可)/.test(sentence)
  ));
}

function evidenceMatch(text, expression) {
  const match = expression.exec(text);
  return match?.[0] || undefined;
}

function componentPricePrefix(text, index) {
  const prefix = text.slice(0, index);
  const boundary = Math.max(
    prefix.lastIndexOf('\n'),
    prefix.lastIndexOf('。'),
    prefix.lastIndexOf('！'),
    prefix.lastIndexOf('？'),
  );
  return prefix.slice(boundary + 1).trim();
}

function freeEvidenceMatch(text) {
  const expression = /(?:入場(?:料|料金)?|参加(?:費|料金)?|料金|入館(?:料)?|観覧(?:料)?|利用料)\s*(?:は|：|:)??\s*(?:無料|無償|なし|不要)|(?:^|[\s、（(])(?:無料|無償|0\s*円|０\s*円)(?=$|[\s、。）（)])/gu;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    const before = componentPricePrefix(text, index);
    // "駐車場料金 無料" is a parking campaign, not event admission. Keep
    // the check scoped to the current sentence so a later "参加費無料"
    // remains valid even when the same sentence also mentions parking.
    if (/(?:駐車場|駐輪場|駐車|駐輪|駐車料金|駐輪料金)\s*(?:[：:]\s*)?(?:の\s*)?(?:(?:ご)?利用|料金|代|利用料)?\s*(?:は|：|:)?\s*$/u.test(before)) continue;
    if (/(?:物販|グッズ|材料費|教材費|参加者?限定)\s*(?:の\s*)?(?:料金|費用|代)?\s*(?:は|：|:)?\s*$/u.test(before)) continue;
    return match[0].replace(/\s+/gu, ' ').trim();
  }
  return undefined;
}

/**
 * Infer only tags that have an explicit phrase in source text.  In
 * particular, a finite start/end date is not itself evidence of `limited`,
 * and an unnamed guest is not evidence of a celebrity.
 */
export function classifyTags({ name = '', description = '', price = '', audience = '', rawTags = '' } = {}) {
  const fields = [name, description, price, audience, rawTags].map(textValue).filter(Boolean);
  const text = fields.join(' ');
  const tags = [];
  const tagEvidence = {};

  const celebrity = /(?:有名人|著名人|芸能人|タレント|俳優|女優|歌手|アイドル|お笑い芸人|芸人|アナウンサー|アスリート|声優|落語家)[^。！？\n]{0,14}(?:来場|出演|登場|トーク|講演|登壇)/u;
  if (!hasNegativeCue(text, /(?:有名人|著名人|芸能人|タレント|俳優|女優|歌手|アイドル|お笑い芸人|芸人|アナウンサー|アスリート|声優|落語家)/u)) {
    const evidence = evidenceMatch(text, celebrity);
    // A role by itself (for example, "歌手を目指す") is not enough.  The
    // role must be paired with an explicit appearance/participation cue.
    if (evidence) {
      tags.push('celebrity');
      tagEvidence.celebrity = evidence;
    }
  }

  const exhibitionExpression = /(?:展覧会|展示会|作品展|写真展|絵画展|美術展|企画展|特別展|展示)/u;
  if (!hasNegativeCue(text, exhibitionExpression)) {
    const evidence = evidenceMatch(text, exhibitionExpression);
    if (evidence) {
      tags.push('exhibition');
      tagEvidence.exhibition = evidence;
    }
  }

  const familyExpression = /(?:親子(?:イベント|向け|対象|参加|で楽し)|家族(?:イベント|向け|連れ|対象|参加)|ファミリー|キッズ|子ども(?:イベント|向け|対象|参加|連れ|コーナー|体験)|こども(?:イベント|向け|対象|参加|連れ)|子供(?:イベント|向け|対象|参加|連れ)|ちびっこ|幼児(?:向け|対象)|小学生(?:向け|対象)|未就学児|お子様(?:向け|連れ|対象))/u;
  if (!hasNegativeCue(text, /(?:親子|家族|ファミリー|キッズ|子ども|こども|子供|ちびっこ|幼児|小学生|未就学児|お子様)/u)) {
    const evidence = evidenceMatch(text, familyExpression);
    if (evidence) {
      tags.push('family');
      tagEvidence.family = evidence;
    }
  }

  const freeContextOnly = /(?:駐車場|駐輪場|駐車|駐輪|物販|グッズ|材料費|一部|小学生以下|子ども|こども|子供|大人|体験|ワークショップ)[^。！？\n]{0,12}(?:無料|有料)/u;
  const freePartial = /(?:一部有料|大人有料|別途有料|物販[^。！？\n]{0,8}有料|(?:体験|ワークショップ)[^。！？\n]{0,8}有料|小学生以下無料)/u;
  if (!hasNegativeCue(text, /(?:無料|無償|0\s*円|０\s*円|料金\s*なし|参加費\s*なし)/u) && !freePartial.test(text)) {
    const evidence = freeEvidenceMatch(text);
    const eventLevelEvidence = /(?:入場(?:料|料金)?|参加(?:費|料金)?|料金|入館(?:料)?|観覧(?:料)?|利用料)\s*(?:は|：|:)?\s*(?:無料|無償|なし|不要)/u.test(evidence ?? '');
    if (evidence && (eventLevelEvidence || !freeContextOnly.test(text))) {
      tags.push('free');
      tagEvidence.free = evidence.replace(/\s+/g, ' ').trim();
    }
  }

  const limitedExpression = /(?:期間限定|一日限定|一日限り|今回限り|限定(?:開催|公開|イベント))/u;
  if (!hasNegativeCue(text, /(?:期間限定|一日限定|一日限り|今回限り|限定(?:開催|公開|イベント))/u)) {
    const evidence = evidenceMatch(text, limitedExpression);
    if (evidence) {
      tags.push('limited');
      tagEvidence.limited = evidence;
    }
  }

  return { tags, tagEvidence };
}

export function eventCategory(name, description = '') {
  const text = `${textValue(name)} ${textValue(description)}`;
  if (/花火/u.test(text)) return 'fireworks';
  if (/祭|フェス|盆踊/u.test(text)) return 'festival';
  if (/マルシェ|市場|市$/u.test(text)) return 'market';
  if (/フリマ|フリー.?マーケット/u.test(text)) return 'fleaMarket';
  if (/展覧|展示|美術|写真展|絵画展|企画展|特別展/u.test(text)) return 'exhibition';
  if (/演劇|舞台|ミュージカル|芝居|公演/u.test(text)) return 'theater';
  if (/音楽|コンサート|ライブ|演奏|吹奏楽/u.test(text)) return 'music';
  if (/博物|資料館|科学館/u.test(text)) return 'museum';
  if (/スポーツ|選手権|マラソン|競技大会|大会/u.test(text)) return 'sports';
  if (/動物|いきもの|昆虫|水族|海の生き物/u.test(text)) return 'zoo';
  if (/イルミ|ライトアップ/u.test(text)) return 'illumination';
  if (/夜|ナイト|星空|天体/u.test(text)) return 'night';
  if (/グルメ|飲食|キッチンカー|収穫|食/u.test(text)) return 'food';
  if (/体験|教室|工作|講座|観察|実習|ヨガ|ウォーキング/u.test(text)) return 'workshop';
  return 'seasonal';
}

function explicitBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = textValue(value);
  if (!text) return undefined;
  if (/^(?:true|yes|1|あり|有|可|対応|無料)$/iu.test(text)) return true;
  if (/^(?:false|no|0|なし|無|不可|非対応)$/iu.test(text)) return false;
  return undefined;
}

function freeValue(price, explicit) {
  if (typeof explicit === 'boolean') return explicit;
  const text = textValue(price);
  if (!text) return null;
  if (classifyTags({ price: text }).tags.includes('free')) return true;
  // A concrete non-zero price is explicit evidence that the event is not
  // free; vague labels such as "要問合せ" remain unknown.
  if (/(?:\d[\d,]*\s*円|有料|参加費あり|料金あり)/u.test(text)) return false;
  return null;
}

function stableIdentity(event) {
  return [event.eventName, event.startDate, event.venueName, event.address, event.startTime].map(normalize).join('|');
}

export function duplicateKey(event) {
  return stableIdentity(event);
}

function relaxedDuplicateKey(event) {
  const name = normalize(event.eventName);
  const date = normalize(event.startDate);
  const venue = normalize(event.venueName);
  return name && date && venue ? `${name}|${date}|${venue}` : undefined;
}

function officialDuplicateKey(event) {
  const officialUrl = officialUrlIdentity(event.officialUrl);
  const title = normalize(event.eventName);
  const date = normalize(event.startDate);
  return officialUrl && title && date ? `${officialUrl}|${title}|${date}` : undefined;
}

function officialUrlIdentity(value) {
  const candidate = httpUrl(value);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    parsed.hash = '';
    // Host names are case-insensitive. Keep path/query punctuation intact so
    // distinct listing/detail URLs cannot collapse into one cache key.
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    return parsed.href;
  } catch {
    return candidate;
  }
}

function compatibleStartTime(first, second) {
  const firstTime = normalizeTime(first?.startTime);
  const secondTime = normalizeTime(second?.startTime);
  // A provider may omit a start time while another provider has it. Treat the
  // omission as incomplete metadata, but never merge two explicit schedules
  // that start at different times.
  return !firstTime || !secondTime || firstTime === secondTime;
}

function compatibleLocation(first, second) {
  for (const field of ['venueName', 'address']) {
    const firstValue = normalize(first?.[field]);
    const secondValue = normalize(second?.[field]);
    // An omitted location can be completed by another provider, but two
    // explicit locations identify separate listings even when they share a
    // landing-page URL and date.
    if (firstValue && secondValue && firstValue !== secondValue) return false;
  }
  return true;
}

function registerIndex(index, key, value) {
  if (!key) return;
  const values = index.get(key) || [];
  if (!values.includes(value)) values.push(value);
  index.set(key, values);
}

function sourceProvenance(event, source) {
  const sourceId = textValue(event.sourceId) || textValue(source?.id);
  const sourceName = textValue(event.source) || textValue(source?.name);
  const sourceUrl = httpUrl(event.sourceUrl) || httpUrl(source?.url);
  const officialUrl = httpUrl(event.officialUrl);
  const lastCheckedAt = textValue(event.lastCheckedAt) || textValue(source?.checkedAt);
  if (!sourceId && !sourceName && !sourceUrl) return [];
  return [{
    ...(sourceId ? { sourceId } : {}),
    ...(sourceName ? { source: sourceName } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
  }];
}

function normalizeEvidence(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(TAG_NAMES
    .map((tag) => [tag, textValue(value[tag])])
    .filter(([, evidence]) => evidence));
}

function normalizeTags(value, evidence) {
  const requested = Array.isArray(value) ? value : textValue(value).split(/[\s,、]+/u);
  return TAG_NAMES.filter((tag) => requested.includes(tag) && evidence[tag]);
}

function normalizeIso(value) {
  const candidate = textValue(value);
  if (!candidate || !ISO_RE.test(candidate)) return undefined;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Normalize an EventItem-like object from an additional provider. */
export function normalizeEventRecord(raw, {
  sourceId,
  sourceName,
  sourceUrl,
  checkedAt,
  sourceStatus = 'success',
} = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const eventName = textValue(raw.eventName ?? raw.title ?? raw.name);
  const startValue = textValue(raw.startDate ?? raw.start);
  const endValue = textValue(raw.endDate) || textValue(raw.end) || startValue;
  const range = validDateRange(startValue, endValue);
  if (!eventName || !range) return null;

  const venueName = textValue(raw.venueName ?? raw.venue ?? raw.locationName) || undefined;
  const address = textValue(raw.address ?? raw.locationAddress) || undefined;
  const description = textValue(raw.description ?? raw.summary) || undefined;
  const price = raw.price === undefined || raw.price === null || textValue(raw.price) === '' ? undefined : raw.price;
  const audience = raw.audience ?? raw.targetAudience ?? '';
  const inferred = classifyTags({
    name: eventName,
    description,
    price,
    audience,
    rawTags: raw.tags,
  });
  const suppliedEvidence = normalizeEvidence(raw.tagEvidence);
  if (textValue(raw.category) === 'exhibition' && !inferred.tags.includes('exhibition')) {
    inferred.tags.push('exhibition');
    inferred.tagEvidence.exhibition = 'category: exhibition';
  }
  const explicitFree = explicitBoolean(raw.freeEvent);
  const inferredTags = explicitFree === false ? inferred.tags.filter((tag) => tag !== 'free') : inferred.tags;
  const suppliedTags = normalizeTags(raw.tags, suppliedEvidence).filter((tag) => explicitFree !== false || tag !== 'free');
  const tags = [...new Set([...inferredTags, ...suppliedTags])]
    .sort((a, b) => TAG_NAMES.indexOf(a) - TAG_NAMES.indexOf(b));
  const tagEvidence = Object.fromEntries(TAG_NAMES
    .filter((tag) => tags.includes(tag))
    .map((tag) => [tag, suppliedEvidence[tag] || inferred.tagEvidence[tag]]));
  const coords = validCoordinates(raw.latitude, raw.longitude);
  const startTime = normalizeTime(raw.startTime);
  const endTime = normalizeTime(raw.endTime);
  const startAt = normalizeIso(raw.startAt) || dateTime(range.startDate, startTime);
  const endAt = normalizeIso(raw.endAt) || dateTime(range.endDate, endTime);
  const identity = [eventName, range.startDate, venueName, address, startTime].map(normalize).join('|');
  const source = textValue(raw.source) || sourceName;
  const canonicalSourceUrl = httpUrl(raw.sourceUrl) || httpUrl(sourceUrl);
  const canonicalOfficialUrl = httpUrl(raw.officialUrl);
  const trustedExplicitFree = explicitFree === false
    ? false
    : explicitFree === true && (suppliedEvidence.free || inferred.tags.includes('free'))
      ? true
      : undefined;
  const event = {
    id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
    eventName,
    ...(venueName ? { venueName } : {}),
    category: textValue(raw.category) || eventCategory(eventName, description),
    ...(description ? { description } : {}),
    ...(address ? { address } : {}),
    ...(coords || {}),
    startDate: range.startDate,
    endDate: range.endDate,
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(startAt ? { startAt } : {}),
    ...(endAt ? { endAt } : {}),
    ...(price !== undefined ? { price } : {}),
    freeEvent: freeValue(price, trustedExplicitFree ?? (tags.includes('free') ? true : undefined)),
    ...(explicitBoolean(raw.indoor) !== undefined ? { indoor: explicitBoolean(raw.indoor) } : {}),
    ...(explicitBoolean(raw.outdoor) !== undefined ? { outdoor: explicitBoolean(raw.outdoor) } : {}),
    ...(explicitBoolean(raw.rainSupport) !== undefined ? { rainSupport: explicitBoolean(raw.rainSupport) } : {}),
    ...(explicitBoolean(raw.parking) !== undefined ? { parking: explicitBoolean(raw.parking) } : {}),
    childFriendly: explicitBoolean(raw.childFriendly) ?? (tags.includes('family') ? true : null),
    ...(explicitBoolean(raw.dateFriendly) !== undefined ? { dateFriendly: explicitBoolean(raw.dateFriendly) } : {}),
    ...(canonicalOfficialUrl ? { officialUrl: canonicalOfficialUrl } : {}),
    ...(canonicalSourceUrl ? { sourceUrl: canonicalSourceUrl } : {}),
    ...(source ? { source } : {}),
    ...(sourceId || raw.sourceId ? { sourceId: textValue(raw.sourceId) || sourceId } : {}),
    ...(tags.length ? { tags } : {}),
    ...(tags.length ? { tagEvidence } : {}),
    ...(textValue(raw.imageUrl) && httpUrl(raw.imageUrl) ? { imageUrl: httpUrl(raw.imageUrl) } : {}),
    ...(textValue(raw.imageSource) ? { imageSource: textValue(raw.imageSource) } : {}),
    ...(httpUrl(raw.imageSourceUrl) ? { imageSourceUrl: httpUrl(raw.imageSourceUrl) } : {}),
    ...(textValue(raw.imageLicense) ? { imageLicense: textValue(raw.imageLicense) } : {}),
    ...(raw.evidence && typeof raw.evidence === 'object' ? {
      evidence: Object.fromEntries(Object.entries(raw.evidence)
        .map(([key, value]) => [textValue(key), textValue(value)])
        .filter(([key, value]) => key && value)),
    } : {}),
    ...(textValue(raw.lastCheckedAt) && sourceStatus === 'stale' ? { lastCheckedAt: textValue(raw.lastCheckedAt) } : {}),
    ...(sourceStatus !== 'stale' && checkedAt ? { lastCheckedAt: checkedAt } : {}),
  };
  const provenance = [
    ...((Array.isArray(raw.provenance) ? raw.provenance : []).filter((entry) => entry && typeof entry === 'object')),
    ...sourceProvenance(event, { id: sourceId, name: sourceName, url: sourceUrl, checkedAt }),
  ];
  if (provenance.length) event.provenance = uniqueProvenance(provenance);
  return event;
}

function uniqueProvenance(entries) {
  const seen = new Set();
  return entries
    .map((entry) => ({
      ...(textValue(entry.sourceId) ? { sourceId: textValue(entry.sourceId) } : {}),
      ...(textValue(entry.source) ? { source: textValue(entry.source) } : {}),
      ...(httpUrl(entry.sourceUrl) ? { sourceUrl: httpUrl(entry.sourceUrl) } : {}),
      ...(httpUrl(entry.officialUrl) ? { officialUrl: httpUrl(entry.officialUrl) } : {}),
      ...(textValue(entry.lastCheckedAt) ? { lastCheckedAt: textValue(entry.lastCheckedAt) } : {}),
    }))
    .filter((entry) => {
      const key = [entry.sourceId, entry.sourceUrl, entry.officialUrl, entry.lastCheckedAt].join('|');
      if (!key.replaceAll('|', '')) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function quality(event, status = 'success') {
  return (status === 'success' ? 20 : status === 'stale' ? 5 : 0)
    + (event.latitude !== undefined && event.longitude !== undefined ? 4 : 0)
    + (event.description ? 2 : 0)
    + (event.officialUrl ? 2 : 0)
    + (event.address ? 1 : 0)
    + (event.imageUrl ? 1 : 0)
    + (Array.isArray(event.tags) ? event.tags.length : 0);
}

function mergeDuplicate(primary, duplicate, primaryStatus = 'success', duplicateStatus = 'success') {
  const preferred = quality(duplicate, duplicateStatus) > quality(primary, primaryStatus) ? duplicate : primary;
  const secondary = preferred === primary ? duplicate : primary;
  const merged = { ...preferred };
  for (const [key, value] of Object.entries(secondary)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') merged[key] = value;
  }
  const tags = [...new Set([...(primary.tags || []), ...(duplicate.tags || [])])]
    .filter((tag) => TAG_NAMES.includes(tag))
    .sort((a, b) => TAG_NAMES.indexOf(a) - TAG_NAMES.indexOf(b));
  if (tags.length) merged.tags = tags;
  const evidence = { ...(primary.tagEvidence || {}), ...(duplicate.tagEvidence || {}) };
  if (tags.length) merged.tagEvidence = Object.fromEntries(tags.map((tag) => [tag, evidence[tag]]).filter(([, value]) => value));
  merged.provenance = uniqueProvenance([
    ...(Array.isArray(primary.provenance) ? primary.provenance : []),
    ...(Array.isArray(duplicate.provenance) ? duplicate.provenance : []),
  ]);
  if (!merged.provenance.length) delete merged.provenance;
  return merged;
}

/** Deduplicate across providers while retaining every source in provenance. */
export function dedupeEvents(events, { sourceStatuses = {} } = {}) {
  const found = new Map();
  const relaxed = new Map();
  const official = new Map();
  for (const event of events) {
    if (!event || !event.eventName || !event.startDate) continue;
    const key = duplicateKey(event);
    const relaxedKey = relaxedDuplicateKey(event);
    const stableCandidate = found.get(key)?.event;
    let existingKey = stableCandidate && compatibleStartTime(stableCandidate, event) ? key : undefined;
    if (!existingKey && relaxedKey && relaxed.has(relaxedKey)) {
      for (const candidateKey of relaxed.get(relaxedKey)) {
        const candidate = found.get(candidateKey)?.event;
        // A venue-level match is safe when one provider omitted its address;
        // two explicitly different addresses or start times remain separate.
        if (candidate && compatibleLocation(candidate, event) && compatibleStartTime(candidate, event)) {
          existingKey = candidateKey;
          break;
        }
      }
    }
    const officialKey = officialDuplicateKey(event);
    if (!existingKey && officialKey && official.has(officialKey)) {
      for (const candidateKey of official.get(officialKey)) {
        const candidate = found.get(candidateKey)?.event;
        if (candidate && compatibleLocation(candidate, event) && compatibleStartTime(candidate, event)) {
          existingKey = candidateKey;
          break;
        }
      }
    }
    const status = sourceStatuses[event.sourceId] || 'success';
    if (!existingKey) {
      const copy = { ...event };
      copy.provenance = uniqueProvenance([
        ...(Array.isArray(copy.provenance) ? copy.provenance : []),
        ...sourceProvenance(copy),
      ]);
      if (!copy.provenance.length) delete copy.provenance;
      found.set(key, { event: copy, status });
      registerIndex(relaxed, relaxedKey, key);
      registerIndex(official, officialKey, key);
      continue;
    }
    const entry = found.get(existingKey);
    entry.event = mergeDuplicate(entry.event, event, entry.status, status);
    entry.status = quality(event, status) > quality(entry.event, entry.status) ? status : entry.status;
    // A record can be matched through its stable/relaxed identity while its
    // official URL key is new. Keep the URL index complete for later records.
    registerIndex(relaxed, relaxedKey, existingKey);
    registerIndex(official, officialKey, existingKey);
  }
  return [...found.values()].map(({ event }) => event);
}

export function filterFutureEvents(events, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
  return events.filter((event) => event.endDate >= today);
}

export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const aValue = a.startAt ?? a.startDate;
    const bValue = b.startAt ?? b.startDate;
    return aValue.localeCompare(bValue) || a.eventName.localeCompare(b.eventName, 'ja-JP') || a.id.localeCompare(b.id);
  });
}
