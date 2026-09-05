import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Coverage audit for the Osaka event map.
 *
 * This module intentionally sits beside, rather than inside, the event
 * collector.  A discovery result is a lead only: it is never appended to
 * events.json.  An event becomes relevant to the audit only after the normal
 * collector has put it in the event snapshot with an official URL and date.
 */

export const DEFAULT_MAX_SOURCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 8_000;
export const DEFAULT_DISCOVERY_LIMIT = 24;
export const DEFAULT_REGISTRY_PATH = new URL('../data/source-registry.json', import.meta.url);
export const DEFAULT_EVENT_DATA_PATH = new URL('../public/data/events.json', import.meta.url);
export const DEFAULT_COLLECTION_REPORT_PATH = new URL('../data/sources/collection-report.json', import.meta.url);
export const DEFAULT_PUBLIC_OUTPUT_PATH = new URL('../public/data/coverage.json', import.meta.url);
export const DEFAULT_REPORT_OUTPUT_PATH = new URL('../data/sources/coverage-report.json', import.meta.url);

const CATEGORY_LABELS = Object.freeze({
  festival: '祭り・フェス',
  fireworks: '花火',
  shopping: 'ショッピング',
  zoo: 'いきもの',
  aquarium: '水族館',
  amusement: '遊園地',
  themePark: 'テーマパーク',
  food: 'グルメ',
  market: 'マルシェ',
  fleaMarket: 'フリーマーケット',
  exhibition: '展覧会',
  museum: '博物館',
  workshop: '体験・教室',
  seasonal: '季節イベント',
  illumination: 'イルミネーション',
  night: '夜イベント',
  music: '音楽',
  theater: '演劇',
  sports: 'スポーツ',
});

const EVENTISH_TEXT = /イベント|展覧会|展示|公演|コンサート|ライブ|フェス|祭|催事|マーケット|マルシェ|花火|イルミ|スポーツ|試合|体験|ワークショップ|ジブリ|Ghibli/iu;
const GENERIC_LINK_TEXT = new Set([
  'ホーム', 'トップ', 'home', 'top', 'アクセス', 'access', 'お問い合わせ', 'contact',
  '会社概要', 'about', '施設案内', 'フロアガイド', 'ショップ', 'ショップ一覧',
  '一覧', 'もっと見る', '詳しく見る', '詳細はこちら', '詳細', '続きを読む', 'read more',
  'ニュース', 'お知らせ', 'news', 'privacy policy', 'サイトマップ', 'sitemap',
  '日本語', 'english', '中文', '한국어', '検索', 'search', 'チケット', 'ticket',
  'イベント', 'event', 'スポーツ', '前のページに戻る', '戻る', '繁體中文', '简体中文',
]);
const NAVIGATION_TITLE = /(?:イベント一覧|イベント年間スケジュール|イベント情報$|スポーツ(?:イベント)?一覧|関連スポーツ施設|スポーツ×|施設一覧|を楽しむ$|を観戦する$|広場\s*No\.|総合スポーツ広場$|お祭り広場$|スタートアップオフィス|注目コンテンツ|WEB\s*サイトをリニューアル|年パスがおトク|全力パス.*販売開始)/iu;

function asPath(value) {
  if (value instanceof URL) return value;
  return pathToFileURL(resolve(String(value)));
}

function textValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function collapseWhitespace(value) {
  return textValue(value).replace(/[\t\r\n ]+/gu, ' ').replace(/　+/gu, ' ').trim();
}

function decodeEntities(value) {
  return collapseWhitespace(value)
    .replace(/&#x([\da-f]+);?/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function stripTags(value) {
  return decodeEntities(textValue(value)
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' '));
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = textValue(tag).match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'iu'));
  return match ? decodeEntities(match[1]) : '';
}

function validHttpUrl(value, base) {
  try {
    const url = new URL(decodeEntities(value), base);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.href;
  } catch {
    return undefined;
  }
}

function nowDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error(`now が不正な日時です: ${String(value)}`);
  return date;
}

function isoDate(value, fallback) {
  const date = value ? new Date(value) : undefined;
  if (date && Number.isFinite(date.getTime())) return date.toISOString();
  return fallback;
}

function normalizedKey(value) {
  return stripTags(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s\u3000\p{P}\p{S}]+/gu, '');
}

function hashId(prefix, value) {
  return `${prefix}-${createHash('sha1').update(String(value)).digest('hex').slice(0, 14)}`;
}

function sourceIdForEvent(event) {
  if (textValue(event?.sourceId)) return textValue(event.sourceId);
  const provenance = Array.isArray(event?.provenance) ? event.provenance : [];
  return textValue(provenance.find((entry) => entry?.sourceId)?.sourceId);
}

function eventHasSource(event, sourceId) {
  if (!sourceId) return false;
  if (sourceIdForEvent(event) === sourceId) return true;
  return Array.isArray(event?.provenance) && event.provenance.some((entry) => entry?.sourceId === sourceId);
}

function publishableEvent(event) {
  if (!event || !textValue(event.eventName)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(textValue(event.startDate))) return false;
  const endDate = textValue(event.endDate || event.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(endDate) || endDate < event.startDate) return false;
  return Boolean(validHttpUrl(event.officialUrl));
}

function reportStatus(rawStatus) {
  if (rawStatus === 'ok') return 'success';
  if (rawStatus === 'partial') return 'stale';
  return ['success', 'stale', 'error'].includes(rawStatus) ? rawStatus : undefined;
}

function normalizeRegistry(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('source-registry.json がオブジェクトではありません');
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const venues = Array.isArray(raw.venues) ? raw.venues : [];
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  const discoveryEntrypoints = Array.isArray(raw.discoveryEntrypoints) ? raw.discoveryEntrypoints : [];
  const candidateSeeds = Array.isArray(raw.candidateSeeds) ? raw.candidateSeeds : [];
  return {
    schemaVersion: Number(raw.schemaVersion) || 1,
    scope: typeof raw.scope === 'string' || (raw.scope && typeof raw.scope === 'object') ? raw.scope : {},
    categories,
    venues,
    sources,
    discoveryEntrypoints,
    candidateSeeds,
    limitations: Array.isArray(raw.limitations) ? raw.limitations.map(textValue).filter(Boolean) : [],
  };
}

function sourceReportMap(eventData, collectionReport) {
  const candidates = [collectionReport?.sources, eventData?.sources];
  const reports = candidates.find((value) => Array.isArray(value) && value.length) || [];
  return new Map(reports.map((source) => [textValue(source?.id), source]).filter(([id]) => id));
}

function sourceFresh(source, now, maxAgeMs) {
  const checkedAt = new Date(source?.checkedAt);
  if (!Number.isFinite(checkedAt.getTime())) return false;
  const age = now.getTime() - checkedAt.getTime();
  return age >= 0 && age <= maxAgeMs;
}

function sourceCoverage(source, { now, maxAgeMs } = {}) {
  if (!source) return { tracked: false, healthy: false, status: 'gap' };
  const status = reportStatus(source.status) || 'error';
  const healthy = status === 'success' && sourceFresh(source, now, maxAgeMs) && Number(source.count) > 0;
  return { tracked: true, healthy, status: healthy ? 'healthy' : 'warning' };
}

function sourceIdsFor(item) {
  const values = [];
  if (Array.isArray(item?.sourceIds)) values.push(...item.sourceIds);
  if (textValue(item?.sourceId)) values.push(item.sourceId);
  return [...new Set(values.map(textValue).filter(Boolean))];
}

function eventMatchesVenue(event, venue) {
  const venueSourceIds = sourceIdsFor(venue);
  if (venueSourceIds.some((sourceId) => eventHasSource(event, sourceId))) return true;
  const aliases = [venue?.name, ...(Array.isArray(venue?.aliases) ? venue.aliases : [])]
    .map(normalizedKey)
    .filter((value) => value.length >= 2);
  if (!aliases.length) return false;
  const haystack = normalizedKey(`${textValue(event?.venueName)} ${textValue(event?.address)}`);
  return aliases.some((alias) => haystack.includes(alias));
}

function eventMatchesCandidate(event, candidate) {
  if (!publishableEvent(event)) return false;
  const officialUrl = validHttpUrl(candidate?.officialCandidateUrl);
  const eventUrl = validHttpUrl(event.officialUrl);
  if (officialUrl && eventUrl && officialUrl === eventUrl) return true;
  const text = normalizedKey(`${event.eventName} ${event.venueName ?? ''} ${event.address ?? ''} ${event.description ?? ''}`);
  const title = normalizedKey(candidate?.title);
  if (!title || title.length < 2) return false;
  if (text.includes(title)) return true;
  const keywords = Array.isArray(candidate?.keywords) ? candidate.keywords.map(normalizedKey).filter((item) => item.length >= 3) : [];
  return keywords.length >= 2 && keywords.every((keyword) => text.includes(keyword));
}

function matchedEventForCandidate(candidate, events) {
  return events.find((event) => eventMatchesCandidate(event, candidate));
}

function candidateSeed(seed, detectedAt) {
  const title = collapseWhitespace(seed?.title);
  if (!title || GENERIC_LINK_TEXT.has(title.toLocaleLowerCase('ja-JP'))) return undefined;
  const status = ['resolved', 'pending', 'dismissed'].includes(seed?.status) ? seed.status : undefined;
  return {
    id: textValue(seed?.id) || hashId('candidate', `${title}\n${seed?.officialCandidateUrl ?? ''}`),
    title,
    priority: seed?.priority === 'high' ? 'high' : 'normal',
    discoveredFrom: collapseWhitespace(seed?.discoveredFrom || seed?.discoveredFromName || '公式探索入口'),
    ...(validHttpUrl(seed?.officialCandidateUrl) ? { officialCandidateUrl: validHttpUrl(seed.officialCandidateUrl) } : {}),
    detectedAt: isoDate(seed?.detectedAt, detectedAt),
    ...(Array.isArray(seed?.keywords) && seed.keywords.length ? { keywords: seed.keywords.map(collapseWhitespace).filter(Boolean) } : {}),
    ...(status ? { status } : {}),
  };
}

function candidateSimilar(first, second) {
  const firstKeywords = Array.isArray(first?.keywords) ? first.keywords.map(normalizedKey).filter(Boolean) : [];
  const secondKeywords = Array.isArray(second?.keywords) ? second.keywords.map(normalizedKey).filter(Boolean) : [];
  if (firstKeywords.length && secondKeywords.length && firstKeywords.some((value) => secondKeywords.includes(value))) return true;
  const firstTitle = normalizedKey(first?.title);
  const secondTitle = normalizedKey(second?.title);
  return Boolean(firstTitle && secondTitle && (firstTitle.includes(secondTitle) || secondTitle.includes(firstTitle)));
}

function mergeCandidateLists(seedCandidates, discoveredCandidates) {
  const merged = [];
  for (const candidate of [...seedCandidates, ...discoveredCandidates]) {
    if (!candidate) continue;
    const existing = merged.find((item) => item.id === candidate.id || candidateSimilar(item, candidate));
    if (!existing) {
      merged.push({ ...candidate });
      continue;
    }
    // A seed gives a stable id/priority and a human-maintained provenance;
    // live discovery may provide a more specific official detail URL.
    if (!existing.officialCandidateUrl && candidate.officialCandidateUrl) existing.officialCandidateUrl = candidate.officialCandidateUrl;
    if (existing.discoveredFrom === '公式探索入口' && candidate.discoveredFrom) existing.discoveredFrom = candidate.discoveredFrom;
    if (existing.detectedAt > candidate.detectedAt) existing.detectedAt = candidate.detectedAt;
    if (existing.priority !== 'high' && candidate.priority === 'high') existing.priority = 'high';
    if (!existing.keywords?.length && candidate.keywords?.length) existing.keywords = candidate.keywords;
  }
  return merged;
}

function candidateOutput(candidate, events) {
  if (candidate.status === 'dismissed') return { ...candidate, status: 'dismissed' };
  const matchedEvent = matchedEventForCandidate(candidate, events);
  return {
    id: candidate.id,
    title: candidate.title,
    priority: candidate.priority,
    discoveredFrom: candidate.discoveredFrom,
    ...(candidate.officialCandidateUrl ? { officialCandidateUrl: candidate.officialCandidateUrl } : {}),
    detectedAt: candidate.detectedAt,
    status: matchedEvent ? 'resolved' : 'pending',
    ...(matchedEvent?.id ? { matchedEventId: matchedEvent.id } : {}),
  };
}

function buildSourceAudit(registry, sourceReports, events, { now, maxAgeMs }) {
  const sourceRows = [];
  for (const source of registry.sources) {
    const id = textValue(source?.id);
    if (!id) continue;
    const report = sourceReports.get(id);
    const coverage = sourceCoverage(report, { now, maxAgeMs });
    const eventCount = events.filter((event) => eventHasSource(event, id)).length;
    sourceRows.push({
      id,
      name: collapseWhitespace(source?.name || report?.name || id),
      ...(validHttpUrl(source?.url || report?.url) ? { url: validHttpUrl(source?.url || report?.url) } : {}),
      status: coverage.status,
      tracked: coverage.tracked,
      healthy: coverage.healthy,
      collectionStatus: reportStatus(report?.status) || 'not-collected',
      count: Number.isFinite(Number(report?.count)) ? Number(report.count) : eventCount,
      eventCount,
      ...(report?.checkedAt ? { lastCheckedAt: report.checkedAt } : {}),
      ...(report?.error ? { error: collapseWhitespace(report.error) } : {}),
    });
  }
  return sourceRows;
}

function buildCategoryAudit(registry, sourceReports, events, { now, maxAgeMs }) {
  return registry.categories.map((category) => {
    const id = textValue(category?.id);
    const sourceIds = sourceIdsFor(category);
    const relevantReports = sourceIds.map((sourceId) => sourceReports.get(sourceId)).filter(Boolean);
    const tracked = relevantReports.filter(Boolean).length;
    const healthy = relevantReports.filter((source) => sourceCoverage(source, { now, maxAgeMs }).healthy).length;
    const eventCount = events.filter((event) => event?.category === id).length;
    const status = tracked === 0 ? 'gap' : (healthy > 0 ? 'healthy' : 'warning');
    return {
      id,
      label: collapseWhitespace(category?.label || CATEGORY_LABELS[id] || id),
      status,
      tracked,
      healthy,
      eventCount,
      sourceIds,
    };
  }).filter((category) => category.id);
}

function buildVenueAudit(registry, sourceReports, events, { now, maxAgeMs }) {
  return registry.venues.map((venue) => {
    const id = textValue(venue?.id);
    const sourceIds = sourceIdsFor(venue);
    const relevantReports = sourceIds.map((sourceId) => sourceReports.get(sourceId)).filter(Boolean);
    const matchedEvents = events.filter((event) => eventMatchesVenue(event, venue));
    const tracked = relevantReports.length > 0;
    const healthy = relevantReports.some((source) => sourceCoverage(source, { now, maxAgeMs }).healthy) && matchedEvents.length > 0;
    const status = !tracked ? 'gap' : (healthy ? 'healthy' : 'warning');
    const checkedAt = relevantReports
      .map((source) => textValue(source.checkedAt))
      .filter((value) => Number.isFinite(new Date(value).getTime()))
      .sort()
      .at(-1);
    return {
      id,
      name: collapseWhitespace(venue?.name || id),
      category: textValue(venue?.category || 'seasonal'),
      ...(validHttpUrl(venue?.url) ? { url: validHttpUrl(venue.url) } : {}),
      status,
      tracked,
      healthy,
      matchedEvents: matchedEvents.length,
      matchedEventIds: matchedEvents.map((event) => event.id).filter(Boolean),
      sourceIds,
      ...(checkedAt ? { lastCheckedAt: checkedAt } : {}),
    };
  }).filter((venue) => venue.id);
}

function buildDiscoveryAudit(registry, discoveryStatuses, { detectedAt }) {
  const byId = new Map((Array.isArray(discoveryStatuses) ? discoveryStatuses : []).map((item) => [textValue(item?.id), item]));
  return registry.discoveryEntrypoints.map((entry) => {
    const id = textValue(entry?.id);
    const status = byId.get(id);
    const url = validHttpUrl(entry?.url);
    return {
      id,
      name: collapseWhitespace(entry?.name || id),
      ...(url ? { url } : {}),
      enabled: entry?.enabled !== false,
      status: status?.status || (entry?.enabled === false ? 'disabled' : 'not-run'),
      candidateCount: Number.isFinite(Number(status?.candidateCount)) ? Number(status.candidateCount) : 0,
      checkedAt: isoDate(status?.checkedAt, detectedAt),
      ...(status?.error ? { error: collapseWhitespace(status.error) } : {}),
    };
  }).filter((entry) => entry.id);
}

/**
 * Parse short, event-like links from one official exploration page.
 * No HTML is retained in the output, and links to another host are ignored
 * unless that host is explicitly allow-listed by the registry entry.
 */
export function discoverCandidatesFromHtml(html, {
  entry = {},
  detectedAt = new Date().toISOString(),
  limit = DEFAULT_DISCOVERY_LIMIT,
} = {}) {
  const baseUrl = validHttpUrl(entry.url);
  if (!baseUrl) return [];
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./iu, '');
  const allowedHosts = new Set([
    baseHost,
    ...(Array.isArray(entry.allowedHosts) ? entry.allowedHosts : []),
  ].map((host) => textValue(host).toLowerCase().replace(/^www\./iu, '')).filter(Boolean));
  const isAllowedHost = (url) => {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./iu, '');
    return [...allowedHosts].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  };
  const candidates = [];
  const seen = new Set();
  const append = (title, href) => {
    const cleanTitle = collapseWhitespace(title);
    const officialCandidateUrl = validHttpUrl(href || baseUrl, baseUrl);
    if (!cleanTitle || cleanTitle.length < 4 || cleanTitle.length > 180 || NAVIGATION_TITLE.test(cleanTitle) || !officialCandidateUrl || !isAllowedHost(officialCandidateUrl)) return;
    const candidateUrl = new URL(officialCandidateUrl);
    const entryUrl = new URL(baseUrl);
    candidateUrl.hash = '';
    entryUrl.hash = '';
    if (candidateUrl.href.replace(/\/$/u, '') === entryUrl.href.replace(/\/$/u, '')) return;
    const key = `${normalizedKey(cleanTitle)}\n${officialCandidateUrl}`;
    if (seen.has(key)) return;
    const path = new URL(officialCandidateUrl).pathname;
    const pathLooksLikeDetail = /\/event\/\d+\/?$/u.test(path) || /\/topics?\/(?:detail|\d+)/iu.test(path);
    const textLooksLikeEvent = EVENTISH_TEXT.test(cleanTitle);
    const includeAll = entry.includeAll === true;
    if (!includeAll && !pathLooksLikeDetail && !textLooksLikeEvent) return;
    if (GENERIC_LINK_TEXT.has(cleanTitle.toLocaleLowerCase('ja-JP'))) return;
    seen.add(key);
    candidates.push({
      id: hashId('candidate', key),
      title: cleanTitle,
      priority: entry.priority === 'high' ? 'high' : 'normal',
      discoveredFrom: collapseWhitespace(entry.name || entry.id || '公式探索入口'),
      officialCandidateUrl,
      detectedAt: isoDate(detectedAt, new Date().toISOString()),
      status: 'pending',
    });
  };
  const source = textValue(html);
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attrs = match[1] || '';
    const inner = match[2] || '';
    append(stripTags(inner), attr(attrs, 'href'));
    if (candidates.length >= limit) break;
  }
  return candidates;
}

async function fetchHtml(fetchImpl, url, timeoutMs) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch が利用できません');
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`探索入口の取得が${timeoutMs}msでタイムアウトしました`)), timeoutMs);
    });
    const request = Promise.resolve(fetchImpl(url, {
      headers: { 'user-agent': 'osaka-event-map/0.2 (+coverage-audit)' },
      signal: controller.signal,
    })).then(async (response) => {
      if (typeof response === 'string') return response;
      if (response?.ok === false) throw new Error(`HTTP ${response.status ?? 'unknown'}`);
      if (typeof response?.text === 'function') return response.text();
      if (typeof response?.arrayBuffer === 'function') return new TextDecoder().decode(await response.arrayBuffer());
      throw new Error('探索入口の応答本文を読み取れません');
    });
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`探索入口の取得が${timeoutMs}msでタイムアウトしました`);
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Fetch only enabled, registry-owned official exploration entrypoints. */
export async function collectDiscoveryCandidates({
  registry,
  now: nowInput = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
  limit = DEFAULT_DISCOVERY_LIMIT,
} = {}) {
  const normalized = normalizeRegistry(registry);
  const now = nowDate(nowInput);
  const detectedAt = now.toISOString();
  const allCandidates = [];
  const statuses = [];
  for (const entry of normalized.discoveryEntrypoints) {
    const id = textValue(entry?.id);
    if (!id || entry?.enabled === false) {
      statuses.push({ id, status: 'disabled', candidateCount: 0, checkedAt: detectedAt });
      continue;
    }
    const url = validHttpUrl(entry?.url);
    if (!url) {
      statuses.push({ id, status: 'warning', candidateCount: 0, checkedAt: detectedAt, error: '公式探索入口URLが不正です' });
      continue;
    }
    try {
      const html = await fetchHtml(fetchImpl, url, timeoutMs);
      const candidates = discoverCandidatesFromHtml(html, { entry: { ...entry, url }, detectedAt, limit: Number(entry.maxCandidates) || limit });
      allCandidates.push(...candidates);
      statuses.push({ id, status: 'success', candidateCount: candidates.length, checkedAt: detectedAt });
    } catch (error) {
      statuses.push({ id, status: 'warning', candidateCount: 0, checkedAt: detectedAt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const unique = [];
  for (const candidate of allCandidates) {
    const existing = unique.find((item) => item.id === candidate.id || candidateSimilar(item, candidate));
    if (!existing) unique.push(candidate);
    else if (!existing.officialCandidateUrl && candidate.officialCandidateUrl) existing.officialCandidateUrl = candidate.officialCandidateUrl;
  }
  return { candidates: unique, statuses };
}

/** Build a coverage report without writing files or touching the network. */
export function auditCoverage({
  eventData = {},
  collectionReport = {},
  registry: registryInput = {},
  now: nowInput = new Date(),
  generatedAt,
  candidates = [],
  discoveryStatuses = [],
  previousCoverage,
  maxAgeMs = DEFAULT_MAX_SOURCE_AGE_MS,
} = {}) {
  const registry = normalizeRegistry(registryInput);
  const now = nowDate(nowInput);
  const eventList = Array.isArray(eventData?.events) ? eventData.events : [];
  const events = eventList.filter(publishableEvent);
  const sourceReports = sourceReportMap(eventData, collectionReport);
  const outputGeneratedAt = isoDate(generatedAt, now.toISOString());

  const seedCandidates = registry.candidateSeeds.map((seed) => candidateSeed(seed, outputGeneratedAt)).filter(Boolean);
  const previousCandidates = Array.isArray(previousCoverage?.candidates)
    ? previousCoverage.candidates.map((candidate) => candidateSeed(candidate, outputGeneratedAt)).filter(Boolean)
    : [];
  const candidateInputs = mergeCandidateLists(
    mergeCandidateLists(seedCandidates, previousCandidates),
    candidates.map((candidate) => candidateSeed(candidate, outputGeneratedAt)).filter(Boolean),
  );
  const outputCandidates = candidateInputs.map((candidate) => candidateOutput(candidate, events));
  const categories = buildCategoryAudit(registry, sourceReports, events, { now, maxAgeMs });
  const venues = buildVenueAudit(registry, sourceReports, events, { now, maxAgeMs });
  const sources = buildSourceAudit(registry, sourceReports, events, { now, maxAgeMs });
  const discovery = buildDiscoveryAudit(registry, discoveryStatuses, { detectedAt: outputGeneratedAt });
  const coverageEntries = [...categories, ...venues];
  const summary = {
    tracked: coverageEntries.filter((entry) => entry.status !== 'gap').length,
    healthy: coverageEntries.filter((entry) => entry.status === 'healthy').length,
    warning: coverageEntries.filter((entry) => entry.status === 'warning').length,
    gap: coverageEntries.filter((entry) => entry.status === 'gap').length,
    resolvedCandidates: outputCandidates.filter((candidate) => candidate.status === 'resolved').length,
    pendingCandidates: outputCandidates.filter((candidate) => candidate.status === 'pending').length,
    highPriorityGaps: outputCandidates.filter((candidate) => candidate.priority === 'high' && candidate.status === 'pending').length,
  };
  const limitations = [
    'この台帳は大阪府内イベントの母集団や網羅率を示すものではなく、登録した公式入口の監視状況だけを示します。',
    '検索結果・ニュース・SNSは発見の手掛かりに使わず、候補をevents.jsonへ直接混入しません。',
    '候補のresolvedは、通常の収集スナップショットに公式URLと開催日を持つイベントが照合できた場合だけです。',
    '未登録の自治体・会場、公式ページの認証領域、取得できないHTML/PDFはこの監査の対象外です。',
    ...registry.limitations,
  ];
  for (const item of discovery) {
    if (item.status === 'warning') limitations.push(`公式探索入口「${item.name}」を確認できませんでした。候補を成功扱いしません。`);
    if (item.status === 'disabled') limitations.push(`公式探索入口「${item.name}」は台帳のみ登録し、まだ自動取得していません。`);
  }
  if (eventList.length !== events.length) limitations.push('必須フィールド（公式URL・開催日）がないイベントは監査照合から除外しました。events.jsonへ候補を補完することはありません。');

  return {
    schemaVersion: 1,
    generatedAt: outputGeneratedAt,
    scope: registry.scope,
    summary,
    categories,
    venues,
    sources,
    discovery,
    candidates: outputCandidates,
    topicAudit: {
      highPriority: outputCandidates.filter((candidate) => candidate.priority === 'high').length,
      resolved: outputCandidates.filter((candidate) => candidate.priority === 'high' && candidate.status === 'resolved').length,
      pending: summary.highPriorityGaps,
    },
    limitations: [...new Set(limitations.filter(Boolean))],
  };
}

async function readJson(pathOrUrl, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(pathOrUrl, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeJsonAtomic(pathOrUrl, value) {
  const target = asPath(pathOrUrl);
  const targetPath = fileURLToPath(target);
  await mkdir(dirname(targetPath), { recursive: true });
  const temporary = new URL(`./.${targetPath.split('/').at(-1)}.${process.pid}.${Date.now()}.tmp`, target);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

/** Run a live or reproducible cached audit and write both contract outputs. */
export async function runCoverageAudit({
  cached = false,
  now: nowInput = new Date(),
  fetchImpl = globalThis.fetch,
  registryPath = DEFAULT_REGISTRY_PATH,
  eventDataPath = DEFAULT_EVENT_DATA_PATH,
  collectionReportPath = DEFAULT_COLLECTION_REPORT_PATH,
  publicOutputPath = DEFAULT_PUBLIC_OUTPUT_PATH,
  reportOutputPath = DEFAULT_REPORT_OUTPUT_PATH,
  timeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
  maxAgeMs = DEFAULT_MAX_SOURCE_AGE_MS,
} = {}) {
  const registry = await readJson(registryPath);
  const eventData = await readJson(eventDataPath);
  const collectionReport = await readJson(collectionReportPath, { optional: true }) || await readJson(new URL('../public/data/collection-report.json', import.meta.url), { optional: true }) || {};
  const previousCoverage = await readJson(reportOutputPath, { optional: true }) || await readJson(publicOutputPath, { optional: true });
  const now = nowDate(nowInput);
  let candidates = [];
  let discoveryStatuses = [];
  let generatedAt = now.toISOString();
  if (cached) {
    // Cached mode never reparses/fetches provider HTML.  Reuse candidate leads
    // and discovery status from the prior normalized audit, keeping timestamps
    // stable while allowing a newly collected official event to resolve one.
    candidates = Array.isArray(previousCoverage?.candidates) ? previousCoverage.candidates : [];
    discoveryStatuses = Array.isArray(previousCoverage?.discovery)
      ? previousCoverage.discovery.map((item) => ({ ...item, status: item.status, checkedAt: item.checkedAt }))
      : [];
    generatedAt = isoDate(previousCoverage?.generatedAt, isoDate(eventData?.generatedAt, now.toISOString()));
  } else {
    const discovery = await collectDiscoveryCandidates({ registry, now, fetchImpl, timeoutMs });
    candidates = discovery.candidates;
    discoveryStatuses = discovery.statuses;
  }
  const report = auditCoverage({
    eventData,
    collectionReport,
    registry,
    now: cached ? new Date(generatedAt) : now,
    generatedAt,
    candidates,
    discoveryStatuses,
    previousCoverage: cached ? previousCoverage : undefined,
    maxAgeMs,
  });
  await writeJsonAtomic(publicOutputPath, report);
  await writeJsonAtomic(reportOutputPath, report);
  return report;
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : textValue(error) || '不明なエラー';
}

export async function runCli(argv = process.argv.slice(2)) {
  const cached = argv.includes('--cached');
  const strict = argv.includes('--strict');
  const report = await runCoverageAudit({ cached });
  const failedDiscovery = report.discovery.some((entry) => entry.status === 'warning');
  const highPriorityGap = report.summary.highPriorityGaps > 0;
  if (strict && (failedDiscovery || highPriorityGap)) {
    throw new Error(`網羅性監査が未解決です（探索警告 ${report.discovery.filter((entry) => entry.status === 'warning').length}件、高優先度gap ${report.summary.highPriorityGaps}件）。coverage.jsonをsuccess扱いしません`);
  }
  console.log(`網羅性監査を出力しました（healthy ${report.summary.healthy}, warning ${report.summary.warning}, gap ${report.summary.gap}, 候補 ${report.candidates.length}件）。`);
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runCli().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
