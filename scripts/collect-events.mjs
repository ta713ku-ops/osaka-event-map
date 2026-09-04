import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseCsv,
  textValue,
  httpUrl,
  normalizeDate,
  normalizeTime,
  validCoordinates,
  validDateRange,
  classifyTags,
  eventCategory,
  normalizeEventRecord,
  dedupeEvents,
  filterFutureEvents,
  sortEvents,
} from './lib/events.mjs';

export const SOURCE_ID = 'bodik-osaka';
export const SOURCE_URL = 'https://data.bodik.jp/dataset/388c34d1-f97a-4865-a547-8e89c53a364a/resource/a6f32430-9e39-49f7-b429-6e4eadcc96de/download/270008_event.csv';
export const SOURCE_PAGE = 'https://data.bodik.jp/dataset/270008_event';
export const SOURCE_NAME = '大阪府オープンデータ（BODIK）';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const CACHED_SOURCE = new URL('../data/sources/270008_event.csv', import.meta.url);
const CACHE_REPORT = new URL('../data/sources/collection-report.json', import.meta.url);
const OUTPUT = new URL('../public/data/events.json', import.meta.url);
const PUBLIC_REPORT = new URL('../public/data/collection-report.json', import.meta.url);
const ADDITIONAL_MODULE = new URL('./sources/index.mjs', import.meta.url);

function filePath(value, fallback) {
  if (!value) return fallback;
  if (value instanceof URL) return value;
  return pathToFileURL(resolve(String(value)));
}

function nowDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error(`now が不正な日時です: ${String(value)}`);
  return date;
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return textValue(error) || '不明なエラー';
}

async function readJson(pathOrUrl) {
  try {
    return JSON.parse(await readFile(pathOrUrl, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeJsonAtomic(pathOrUrl, value) {
  const target = filePath(pathOrUrl, pathOrUrl);
  await mkdir(dirname(fileURLToPath(target)), { recursive: true });
  const base = fileURLToPath(target).split('/').pop() || 'output.json';
  const temporary = new URL(`./.${base}.${process.pid}.${Date.now()}.tmp`, target);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.active = 0;
    this.waiters = [];
  }

  async run(task) {
    if (this.active >= this.limit) await new Promise((resolveWaiter) => this.waiters.push(resolveWaiter));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

async function responseText(response) {
  if (typeof response === 'string') return response;
  if (response && typeof response.text === 'function') return response.text();
  if (response && typeof response.arrayBuffer === 'function') return new TextDecoder().decode(await response.arrayBuffer());
  throw new Error('取得先の応答本文を読み取れません');
}

async function responseBytes(response) {
  if (typeof response === 'string') return new TextEncoder().encode(response);
  if (response instanceof Uint8Array) return response;
  if (response && typeof response.arrayBuffer === 'function') return new Uint8Array(await response.arrayBuffer());
  if (response && typeof response.text === 'function') return new TextEncoder().encode(await response.text());
  throw new Error('取得先の応答バイト列を読み取れません');
}

async function fetchResponse(fetchImpl, url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  semaphore,
  consume,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch が利用できません');
  const request = async () => {
    const controller = new AbortController();
    const timeoutError = () => new Error(`取得が${timeoutMs}msでタイムアウトしました`);
    let timeout;
    const timedOut = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort(timeoutError());
        reject(timeoutError());
      }, timeoutMs);
    });
    const operation = (async () => {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': 'osaka-event-map/0.2 (+public-data-collector)', ...headers },
        signal: controller.signal,
      });
      if (typeof response !== 'string' && response?.ok === false) throw new Error(`HTTP ${response.status ?? 'unknown'}`);
      return typeof consume === 'function' ? consume(response) : response;
    })();
    try {
      // Race both the network request and body consumption.  Native fetch
      // honours AbortSignal, but a test adapter or a provider wrapper may not;
      // the collector must still stop waiting at the configured deadline.
      return await Promise.race([operation, timedOut]);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`取得が${timeoutMs}msでタイムアウトしました`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  return semaphore ? semaphore.run(request) : request();
}

/** Parent fetch function passed to additional providers. */
export function createFetchText({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  cached = false,
  cacheDirectory = new URL('../data/sources/', import.meta.url),
  cachedTextResolver,
} = {}) {
  const semaphore = new Semaphore(concurrency);
  return async function fetchText(url) {
    if (cached) {
      if (typeof cachedTextResolver === 'function') return cachedTextResolver(url);
      // A cached build is allowed to read only the normalized snapshot (or an
      // explicit test/CI resolver). Raw provider HTML fixtures must never be
      // mistaken for a current successful source response.
      throw new Error(`--cached の正規化済みスナップショットがありません: ${url}`);
    }
    return fetchResponse(fetchImpl, url, { timeoutMs, semaphore, consume: responseText });
  };
}

function decodeBodik(bytes) {
  if (typeof bytes === 'string') return bytes.replace(/^\uFEFF/, '');
  // The checked-in cache is UTF-8, while the live BODIK download is commonly
  // Shift_JIS. Detect strict UTF-8 first so reusing the cache never corrupts
  // Japanese headers and silently yields zero valid records.
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    if (utf8.includes('イベント名') || utf8.includes('開始日')) return utf8;
  } catch {
    // Fall through to the documented BODIK Shift_JIS decoding.
  }
  return new TextDecoder('shift_jis').decode(bytes).replace(/^\uFEFF/, '');
}

function discoverBodikResource(page) {
  const text = textValue(page).replaceAll('&amp;', '&');
  const candidates = [...text.matchAll(/https?:\/\/[^\s"'<>]+/giu)]
    .map((match) => match[0].replace(/[),.;]+$/u, ''))
    .map(httpUrl)
    .filter((url) => url && (url.includes('270008_event') || /(?:event|csv)/iu.test(url)));
  return candidates.find((url) => /\.csv(?:$|[?#])/iu.test(url)) || candidates[0];
}

function sourceAddress(row) {
  const joined = [
    row['所在地_都道府県'],
    row['所在地_市区町村'],
    row['所在地_町字'],
    row['所在地_番地以下'],
    row['建物名等(方書)'],
  ].map(textValue).filter(Boolean).join('');
  return textValue(row['所在地_連結表記']) || joined || undefined;
}

function explicitParking(value) {
  const text = textValue(value);
  if (!text) return undefined;
  if (/あり|有|可/u.test(text) && !/なし|無|不可/u.test(text)) return true;
  if (/なし|無|不可/u.test(text)) return false;
  return undefined;
}

export function rowToEvent(row, checkedAt, sourceStatus = 'success') {
  const eventName = textValue(row['イベント名']);
  const startDate = normalizeDate(row['開始日']);
  const rawEndDate = textValue(row['終了日']);
  const endDate = rawEndDate ? normalizeDate(rawEndDate) : startDate;
  if (!eventName || !startDate || (rawEndDate && !endDate) || !validDateRange(startDate, endDate)) return null;
  const description = textValue(row['概要']) || textValue(row['説明']) || undefined;
  const venueName = textValue(row['場所名称']) || textValue(row['集合（受付）場所']) || undefined;
  const address = sourceAddress(row);
  const price = textValue(row['料金(基本)']) || undefined;
  const tags = classifyTags({ name: eventName, description, price, audience: row['対象者'], rawTags: row['タグ'] });
  const coords = validCoordinates(row['緯度'], row['経度']);
  const startTime = normalizeTime(row['開始時間']);
  const endTime = normalizeTime(row['終了時間']);
  const officialUrl = httpUrl(row['コンテンツURL']) || httpUrl(row['URL']) || SOURCE_PAGE;
  const imageUrl = httpUrl(row['画像']);
  const event = normalizeEventRecord({
    eventName,
    venueName,
    address,
    category: eventCategory(eventName, description),
    description,
    ...(coords || {}),
    startDate,
    endDate,
    startTime,
    endTime,
    price,
    freeEvent: tags.tags.includes('free') ? true : undefined,
    indoor: /館|室内|ホール/u.test(`${venueName ?? ''} ${description ?? ''}`) ? true : undefined,
    outdoor: /公園|広場|森|里山|海|緑地/u.test(`${venueName ?? ''} ${description ?? ''}`) ? true : undefined,
    rainSupport: /雨天決行|雨天開催/u.test(textValue(row['開催条件'])) ? true : (/雨天中止|荒天中止/u.test(textValue(row['開催条件'])) ? false : undefined),
    parking: explicitParking(row['駐車場情報']),
    childFriendly: tags.tags.includes('family') ? true : undefined,
    dateFriendly: /イルミ|花火|夜|ライトアップ|音楽|コンサート|マルシェ/u.test(`${eventName} ${description ?? ''}`) ? true : undefined,
    officialUrl,
    imageUrl,
    imageSource: imageUrl ? '大阪府オープンデータ（BODIK）のイベントCSV「画像」欄' : undefined,
    imageSourceUrl: imageUrl ? SOURCE_PAGE : undefined,
    imageLicense: textValue(row['画像_ライセンス']) || undefined,
    tags: tags.tags,
    tagEvidence: tags.tagEvidence,
    sourceId: SOURCE_ID,
    source: SOURCE_NAME,
    sourceUrl: SOURCE_PAGE,
    lastCheckedAt: checkedAt,
  }, {
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_PAGE,
    checkedAt,
    sourceStatus,
  });
  if (!event) return null;
  // Preserve the existing overnight-event behavior without accepting an
  // invalid date range. The date itself remains the source-provided date.
  if (event.startAt && event.endAt && event.startDate === event.endDate && event.endAt <= event.startAt) {
    event.endAt = new Date(new Date(event.endAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return event;
}

export function parseBodikEvents(csv, checkedAt, sourceStatus = 'success') {
  return parseCsv(csv).map((row) => rowToEvent(row, checkedAt, sourceStatus)).filter(Boolean);
}

async function readCachedSource(pathOrUrl, checkedAt) {
  try {
    const sourcePath = filePath(pathOrUrl, pathOrUrl);
    const text = await readFile(sourcePath, 'utf8');
    // Filesystem mtime changes on checkout/restore and is not evidence that a
    // provider was checked. Use the persisted report/output timestamp only.
    return { text, checkedAt: textValue(checkedAt) || undefined };
  } catch {
    return undefined;
  }
}

async function loadBodikSource({
  now,
  cached,
  fetchImpl,
  fetchText,
  sourceUrl = SOURCE_URL,
  sourceCachePath = CACHED_SOURCE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  semaphore,
  maxCacheAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  cachedCheckedAt,
}) {
  const nowIso = now.toISOString();
  const cachedSource = await readCachedSource(sourceCachePath, cachedCheckedAt);
  const cacheIsUsable = (candidate) => {
    if (!candidate) return false;
    if (cached) return true;
    const age = now.getTime() - new Date(candidate.checkedAt).getTime();
    return Number.isFinite(age) && age >= 0 && age <= maxCacheAgeMs;
  };

  if (cached && cachedSource) {
    try {
      const events = parseBodikEvents(cachedSource.text, cachedSource.checkedAt, 'success');
      return {
        source: { id: SOURCE_ID, name: SOURCE_NAME, url: SOURCE_PAGE, status: 'success', count: events.length, checkedAt: cachedSource.checkedAt, mode: 'cached' },
        events,
      };
    } catch (error) {
      return { source: { id: SOURCE_ID, name: SOURCE_NAME, url: SOURCE_PAGE, status: 'error', count: 0, checkedAt: nowIso, error: errorMessage(error) }, events: [] };
    }
  }

  try {
    let response;
    try {
      response = await fetchResponse(fetchImpl, sourceUrl, { timeoutMs, semaphore, consume: responseBytes });
    } catch (directError) {
      // BODIK occasionally rotates resource UUIDs. Consult the public page
      // only after the known resource fails.
      const page = await fetchText(SOURCE_PAGE);
      const discovered = discoverBodikResource(page);
      if (!discovered || discovered === sourceUrl) throw directError;
      response = await fetchResponse(fetchImpl, discovered, { timeoutMs, semaphore, consume: responseBytes });
      sourceUrl = discovered;
    }
    const csv = decodeBodik(await response);
    const events = parseBodikEvents(csv, nowIso, 'success');
    if (events.length === 0) throw new Error('BODIK CSVに有効なイベントがありません');
    const sourcePath = filePath(sourceCachePath, sourceCachePath);
    await mkdir(dirname(fileURLToPath(sourcePath)), { recursive: true });
    // Keep the downloaded field values byte-for-byte intact while storing a
    // platform-independent LF-delimited cache.  This prevents CRLF carriage
    // returns from appearing as trailing whitespace in the tracked snapshot.
    await writeFile(sourcePath, csv.replace(/\r\n?/gu, '\n'));
    return {
      source: { id: SOURCE_ID, name: SOURCE_NAME, url: SOURCE_PAGE, status: 'success', count: events.length, checkedAt: nowIso, fetchedUrl: sourceUrl },
      events,
    };
  } catch (error) {
    if (cacheIsUsable(cachedSource)) {
      try {
        const events = parseBodikEvents(cachedSource.text, cachedSource.checkedAt, 'stale');
        if (events.length) {
          return {
            source: { id: SOURCE_ID, name: SOURCE_NAME, url: SOURCE_PAGE, status: 'stale', count: events.length, checkedAt: cachedSource.checkedAt, error: `最新取得に失敗したためキャッシュを使用: ${errorMessage(error)}` },
            events,
          };
        }
      } catch {
        // Fall through to an explicit source error below.
      }
    }
    return { source: { id: SOURCE_ID, name: SOURCE_NAME, url: SOURCE_PAGE, status: 'error', count: 0, checkedAt: nowIso, error: errorMessage(error) }, events: [] };
  }
}

async function loadPreviousReport(pathOrUrl = CACHE_REPORT) {
  const value = await readJson(pathOrUrl);
  return value && Array.isArray(value.sources) ? value : undefined;
}

function normalizeSourceReport(raw, {
  nowIso,
  cached,
  previous,
  fallbackId = 'additional',
  fallbackName = '追加公式ソース',
  fallbackUrl,
  count = 0,
} = {}) {
  const id = textValue(raw?.id) || fallbackId;
  const previousSource = previous?.sources?.find((source) => source.id === id);
  const rawStatus = raw?.status === 'ok' ? 'success'
    : raw?.status === 'partial' ? 'stale'
      : ['success', 'error', 'stale'].includes(raw?.status) ? raw.status : undefined;
  // A cached build must not turn a previous failure/stale report into a
  // success merely because a raw file is present.
  const status = cached && ['error', 'stale'].includes(previousSource?.status)
    ? previousSource.status
    : rawStatus || (cached && previousSource?.status) || 'success';
  const checkedAt = cached
    ? textValue(previousSource?.checkedAt) || textValue(raw?.checkedAt) || undefined
    : textValue(raw?.checkedAt) || nowIso;
  const error = status === 'error' || status === 'stale'
    ? textValue(previousSource?.error) || textValue(raw?.error) || undefined
    : undefined;
  const reportedCount = Number(raw?.count);
  const countValue = cached && previousSource && Number.isFinite(reportedCount) && reportedCount === 0
    ? Number(previousSource.count) || 0
    : (Number.isFinite(reportedCount) ? reportedCount : count);
  return {
    id,
    name: textValue(raw?.name) || textValue(previousSource?.name) || fallbackName,
    ...(httpUrl(raw?.url) || httpUrl(previousSource?.url) || httpUrl(fallbackUrl) ? { url: httpUrl(raw?.url) || httpUrl(previousSource?.url) || httpUrl(fallbackUrl) } : {}),
    status,
    count: countValue,
    ...(checkedAt ? { checkedAt } : {}),
    ...(error ? { error } : {}),
    ...(raw?.mode ? { mode: textValue(raw.mode) } : {}),
  };
}

async function importAdditionalCollector() {
  try {
    const module = await import(ADDITIONAL_MODULE.href);
    return typeof module.collectAdditionalEvents === 'function' ? module.collectAdditionalEvents : undefined;
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(fileURLToPath(ADDITIONAL_MODULE))) return undefined;
    throw error;
  }
}

async function collectAdditional({ now, cached, fetchText, previousReport, collectorOverride }) {
  let collector;
  if (typeof collectorOverride === 'function') {
    collector = collectorOverride;
  } else {
    try {
      collector = await importAdditionalCollector();
    } catch (error) {
      return { events: [], sources: [normalizeSourceReport({ id: 'additional', name: '追加公式ソース', status: 'error', error: errorMessage(error) }, { nowIso: now.toISOString(), cached, previous: previousReport })] };
    }
  }
  if (!collector) return { events: [], sources: [] };
  try {
    const result = await collector({ fetchText, now, cached });
    const rawSources = Array.isArray(result?.sources) ? result.sources : [];
    const sourceMap = new Map(rawSources.map((source) => [textValue(source?.id), source]).filter(([id]) => id));
    const events = [];
    const sourceCounts = new Map();
    for (const rawEvent of Array.isArray(result?.events) ? result.events : []) {
      const id = textValue(rawEvent?.sourceId) || (sourceMap.size === 1 ? [...sourceMap.keys()][0] : 'additional');
      const source = sourceMap.get(id);
      if (source?.status === 'error') continue;
      const normalized = normalizeEventRecord(rawEvent, {
        sourceId: id,
        sourceName: textValue(source?.name) || '追加公式ソース',
        sourceUrl: httpUrl(source?.url),
        checkedAt: cached ? textValue(source?.checkedAt) || undefined : textValue(source?.checkedAt) || now.toISOString(),
        sourceStatus: source?.status === 'stale' || source?.status === 'partial' ? 'stale' : 'success',
      });
      if (!normalized) continue;
      events.push(normalized);
      sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
    }
    const sources = rawSources.map((source) => normalizeSourceReport(source, { nowIso: now.toISOString(), cached, previous: previousReport, count: sourceCounts.get(textValue(source?.id)) || 0 }));
    if (!sources.length && events.length) {
      const ids = [...new Set(events.map((event) => event.sourceId).filter(Boolean))];
      for (const id of ids) sources.push(normalizeSourceReport({ id, name: '追加公式ソース', status: 'success', count: sourceCounts.get(id) || 0 }, { nowIso: now.toISOString(), cached, previous: previousReport }));
    }
    return { events, sources };
  } catch (error) {
    return { events: [], sources: [normalizeSourceReport({ id: 'additional', name: '追加公式ソース', status: 'error', error: errorMessage(error) }, { nowIso: now.toISOString(), cached, previous: previousReport })] };
  }
}

function cacheTimestamp(event, source, cache) {
  const sourceId = textValue(source?.id) || textValue(event?.sourceId);
  const matchingProvenance = Array.isArray(event?.provenance)
    ? event.provenance.filter((entry) => !sourceId || entry?.sourceId === sourceId)
    : [];
  // A deduplicated record may carry the canonical timestamp from another
  // provider. For source-specific recovery, use only the failed provider's
  // provenance/source timestamp; a successful provider must not extend its
  // neighbor's 14-day lease.
  if (sourceId && event?.sourceId !== sourceId && matchingProvenance.length) {
    return textValue(matchingProvenance.find((entry) => entry?.lastCheckedAt)?.lastCheckedAt)
      || textValue(cache?.sources?.find((item) => item?.id === sourceId)?.checkedAt);
  }
  return textValue(event?.lastCheckedAt)
    || textValue(matchingProvenance.find((entry) => entry?.lastCheckedAt)?.lastCheckedAt)
    || textValue(cache?.sources?.find((item) => item?.id === sourceId)?.checkedAt)
    || textValue(cache?.generatedAt);
}

function cacheEventIsUsable(event, cache, now, maxAgeMs) {
  const timestamp = new Date(cacheTimestamp(event, cache?.sources?.find((source) => source.id === event?.sourceId), cache));
  if (!Number.isFinite(timestamp.getTime())) return false;
  const age = now.getTime() - timestamp.getTime();
  return age >= 0 && age <= maxAgeMs && normalizeDate(event?.startDate) && normalizeDate(event?.endDate || event?.startDate);
}

function cachedEventsFor(cache, now, maxAgeMs) {
  if (!cache || !Array.isArray(cache.events)) return [];
  return cache.events.filter((event) => cacheEventIsUsable(event, cache, now, maxAgeMs));
}

function sourceEventCacheDate(event, source, cache) {
  const value = cacheTimestamp(event, source, cache);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function restoreFailedSourceEvents({ events, sources, previousReport, now, maxAgeMs }) {
  const previousEvents = Array.isArray(previousReport?.events) ? previousReport.events : [];
  if (!previousEvents.length) return { events, sources };
  const restored = [...events];
  const resultSources = sources.map((source) => {
    if (!['error', 'stale'].includes(source.status)) return source;
    const candidates = previousEvents.filter((event) => {
      if (event?.sourceId !== source.id) {
        const hasProvenance = Array.isArray(event?.provenance) && event.provenance.some((entry) => entry?.sourceId === source.id);
        if (!hasProvenance) return false;
      }
      const checkedAt = sourceEventCacheDate(event, source, previousReport);
      return checkedAt && now.getTime() >= checkedAt.getTime() && now.getTime() - checkedAt.getTime() <= maxAgeMs;
    });
    if (!candidates.length) return source;
    restored.push(...candidates);
    return {
      ...source,
      status: 'stale',
      count: Math.max(Number(source.count) || 0, candidates.length),
      error: source.error || '最新取得に失敗したため前回のイベントを使用しています',
    };
  });
  return { events: restored, sources: resultSources };
}

function outputFreshness({ cached, sources, usingLastGood }) {
  if (usingLastGood && !cached) return 'stale';
  if (cached) return sources.some((source) => source.status === 'error' || source.status === 'stale')
    ? (sources.some((source) => source.status === 'success') ? 'partial' : 'stale')
    : 'cached';
  const hasErrors = sources.some((source) => source.status === 'error' || source.status === 'stale');
  return hasErrors ? (sources.some((source) => source.status === 'success') ? 'partial' : 'stale') : 'fresh';
}

function generatedAtFor({ cached, sources, nowIso, lastGood }) {
  if (!cached) return lastGood?.generatedAt && !sources.some((source) => source.status === 'success') ? lastGood.generatedAt : nowIso;
  const dates = sources.map((source) => source.checkedAt).filter((value) => value && !Number.isNaN(new Date(value).getTime())).sort();
  return dates.at(-1) || lastGood?.generatedAt || nowIso;
}

function attributionFor(sources, previous) {
  const bodik = sources.find((source) => source.id === SOURCE_ID);
  return {
    name: bodik?.name || previous?.attribution?.name || '大阪府 イベント一覧',
    license: previous?.attribution?.license || 'CC BY 4.0',
    sourceUrl: bodik?.url || previous?.attribution?.sourceUrl || SOURCE_PAGE,
  };
}

function reportEnvelope(envelope) {
  return { schemaVersion: envelope.schemaVersion, generatedAt: envelope.generatedAt, freshness: envelope.freshness, eventCount: envelope.events.length, sources: envelope.sources };
}

function newestSnapshot(first, second) {
  const candidates = [first, second].filter((value) => value && Array.isArray(value.events) && Array.isArray(value.sources));
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => {
    const aTime = new Date(a.generatedAt).getTime();
    const bTime = new Date(b.generatedAt).getTime();
    return (Number.isFinite(bTime) ? bTime : -Infinity) - (Number.isFinite(aTime) ? aTime : -Infinity);
  })[0];
}

/** Collect all available official events. */
export async function collectEvents({
  now: nowInput = new Date(),
  cached = false,
  fetchImpl = globalThis.fetch,
  sourceUrl = SOURCE_URL,
  sourceCachePath = CACHED_SOURCE,
  outputPath = OUTPUT,
  reportPath = PUBLIC_REPORT,
  cacheReportPath = CACHE_REPORT,
  previousReportPath = cacheReportPath,
  maxCacheAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  cachedTextResolver,
  additionalCollector,
} = {}) {
  const now = nowDate(nowInput);
  const nowIso = now.toISOString();
  const previousReport = await loadPreviousReport(previousReportPath);
  const lastGood = await readJson(outputPath);
  const previousSnapshot = newestSnapshot(previousReport, lastGood);
  const cachedSnapshot = cached && previousSnapshot;
  if (cached && !cachedSnapshot) {
    throw new Error('検証済みの正規化済みスナップショットがありません。--cached では raw ソースを再解析できません');
  }
  if (cachedSnapshot && Array.isArray(cachedSnapshot.events) && Array.isArray(cachedSnapshot.sources)) {
    // The normalized snapshot is the reproducible cache. Do not re-fetch or
    // re-parse provider HTML in this mode; this also keeps source statuses and
    // every event's lastCheckedAt byte-for-byte stable across builds.
    const hasIssue = cachedSnapshot.sources.some((source) => source.status === 'error' || source.status === 'stale');
    const hasSuccess = cachedSnapshot.sources.some((source) => source.status === 'success');
    const envelope = {
      ...cachedSnapshot,
      schemaVersion: 2,
      generatedAt: cachedSnapshot.generatedAt,
      freshness: hasIssue ? (hasSuccess ? 'partial' : 'stale') : 'cached',
      sources: cachedSnapshot.sources,
      events: cachedSnapshot.events,
    };
    await writeJsonAtomic(outputPath, envelope);
    await writeJsonAtomic(reportPath, reportEnvelope(envelope));
    return envelope;
  }
  const persistedBodik = previousSnapshot?.sources?.find((source) => source.id === SOURCE_ID)
    || lastGood?.sources?.find((source) => source.id === SOURCE_ID);
  const cachedCheckedAt = textValue(persistedBodik?.checkedAt) || textValue(lastGood?.generatedAt);
  const fetchText = createFetchText({ fetchImpl, timeoutMs, concurrency, cached, cachedTextResolver });
  const semaphore = new Semaphore(concurrency);
  const bodik = await loadBodikSource({ now, cached, fetchImpl, fetchText, sourceUrl, sourceCachePath, timeoutMs, semaphore, maxCacheAgeMs, cachedCheckedAt });
  // Additional providers use `now` both for filtering and for checkedAt. A
  // cached build must use a stable snapshot reference rather than minting a
  // new timestamp on every invocation.
  const cachedReference = previousReport?.generatedAt || bodik.source.checkedAt;
  const sourceNow = cached && cachedReference && !Number.isNaN(new Date(cachedReference).getTime())
    ? new Date(cachedReference)
    : now;
  const additional = await collectAdditional({ now: sourceNow, cached, fetchText, previousReport: previousSnapshot, collectorOverride: additionalCollector });
  const sourceReports = [
    normalizeSourceReport(bodik.source, { nowIso, cached, previous: previousSnapshot, count: bodik.events.length, fallbackId: SOURCE_ID, fallbackName: SOURCE_NAME, fallbackUrl: SOURCE_PAGE }),
    ...additional.sources,
  ];
  const sourceStatuses = Object.fromEntries(sourceReports.map((source) => [source.id, source.status]));
  const providerEvents = [...bodik.events, ...additional.events];
  const restored = restoreFailedSourceEvents({ events: providerEvents, sources: sourceReports, previousReport: previousSnapshot, now: sourceNow, maxAgeMs: maxCacheAgeMs });
  const restoredStatuses = Object.fromEntries(restored.sources.map((source) => [source.id, source.status]));
  const futureEvents = filterFutureEvents(restored.events, sourceNow);
  const events = sortEvents(dedupeEvents(futureEvents, { sourceStatuses: { ...sourceStatuses, ...restoredStatuses } }));
  sourceReports.splice(0, sourceReports.length, ...restored.sources);
  const allFailed = sourceReports.length > 0 && sourceReports.every((source) => source.status === 'error');
  const reusableLastGoodEvents = sortEvents(filterFutureEvents(cachedEventsFor(lastGood, now, maxCacheAgeMs), sourceNow));
  const hasUsableLastGood = reusableLastGoodEvents.length > 0;
  let retainedEvents = events;
  let usingLastGood = false;
  if (allFailed && !events.length) {
    if (!hasUsableLastGood) {
      const providers = sourceReports.map((source) => `${source.name}: ${source.error || source.status}`).join('; ');
      throw new Error(`全公式ソースの取得に失敗し、利用可能なキャッシュもありません。${providers}`);
    }
    retainedEvents = reusableLastGoodEvents;
    usingLastGood = true;
  } else if (!events.length && hasUsableLastGood && sourceReports.every((source) => source.status !== 'success')) {
    retainedEvents = reusableLastGoodEvents;
    usingLastGood = true;
  } else if (cached && hasUsableLastGood && sourceReports.some((source) => source.status === 'error' || source.status === 'stale')) {
    // The checked-in output is itself a last-good snapshot for providers that
    // have no raw cache file. Keep those events visible, but retain the
    // previous source statuses so this branch can never look fresh.
    retainedEvents = reusableLastGoodEvents;
  }

  const generatedAt = generatedAtFor({ cached, sources: sourceReports, nowIso, lastGood: usingLastGood ? lastGood : undefined });
  const envelope = {
    schemaVersion: 2,
    generatedAt,
    freshness: outputFreshness({ cached, sources: sourceReports, usingLastGood }),
    attribution: attributionFor(sourceReports, lastGood),
    sources: sourceReports,
    events: retainedEvents,
  };
  await writeJsonAtomic(outputPath, envelope);
  await writeJsonAtomic(reportPath, reportEnvelope(envelope));
  if (!cached) await writeJsonAtomic(cacheReportPath, envelope);
  return envelope;
}

export async function runCli(argv = process.argv.slice(2)) {
  const cached = argv.includes('--cached');
  const envelope = await collectEvents({ cached });
  const message = cached
    ? `検証済みキャッシュからイベント ${envelope.events.length}件を再現しました（${envelope.freshness}）。`
    : `公式イベント ${envelope.events.length}件を正規化・重複排除しました（${envelope.freshness}）。`;
  console.log(message);
  for (const source of envelope.sources) {
    if (source.status !== 'success') console.warn(`[${source.status}] ${source.name}: ${source.error || '取得できませんでした'}`);
  }
  return envelope;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runCli().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
