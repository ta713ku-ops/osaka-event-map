import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  collectEvents,
  createFetchText,
  rowToEvent,
  SOURCE_URL,
} from './collect-events.mjs';
import {
  classifyTags,
  dedupeEvents,
  normalizeEventRecord,
  normalizeDate,
  validCoordinates,
} from './lib/events.mjs';

const NOW = new Date('2026-09-04T12:00:00+09:00');
const LATER = new Date('2026-09-05T12:00:00+09:00');
const SOURCE_CSV = new URL('../data/sources/270008_event.csv', import.meta.url);

async function fixtureDir() {
  const directory = await mkdtemp(join(tmpdir(), 'osaka-event-collection-'));
  await mkdir(join(directory, 'sources'), { recursive: true });
  await writeFile(join(directory, 'sources', '270008_event.csv'), await readFile(SOURCE_CSV));
  return directory;
}

function responseFor(bytes) {
  const data = Uint8Array.from(bytes);
  return { ok: true, arrayBuffer: async () => data.slice().buffer };
}

function fixedBodikFetch(bytes) {
  return async (url) => {
    if (url === SOURCE_URL) return responseFor(bytes);
    throw new Error(`unexpected URL: ${url}`);
  };
}

function fixtureEvent(index, overrides = {}) {
  return {
    eventName: `Fixture event ${index}`,
    startDate: '2099-01-01',
    endDate: '2099-01-02',
    venueName: 'Fixture venue',
    address: `Osaka ${index}`,
    latitude: 34.69 + index / 10_000,
    longitude: 135.50 + index / 10_000,
    description: 'Official fixture',
    officialUrl: `https://example.test/events/${index}`,
    ...overrides,
  };
}

async function collectIn(directory, options = {}) {
  const sourceCachePath = join(directory, 'sources', '270008_event.csv');
  const outputPath = join(directory, 'events.json');
  const reportPath = join(directory, 'public-report.json');
  const cacheReportPath = join(directory, 'sources', 'collection-report.json');
  return collectEvents({
    now: NOW,
    fetchImpl: fixedBodikFetch(await readFile(sourceCachePath)),
    sourceCachePath,
    outputPath,
    reportPath,
    cacheReportPath,
    previousReportPath: cacheReportPath,
    ...options,
  });
}

test('retains every valid record beyond the former 50-item cap', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await collectIn(directory, {
    additionalCollector: async () => ({
      events: Array.from({ length: 55 }, (_, index) => fixtureEvent(index)),
      sources: [{ id: 'fixture', name: 'Fixture source', url: 'https://example.test/events', status: 'success', count: 55, checkedAt: '2098-12-01T00:00:00.000Z' }],
    }),
  });
  assert.ok(result.events.length > 50);
  assert.equal(result.events.filter((event) => event.sourceId === 'fixture').length, 55);
});

test('keeps valid providers when another provider fails and reports the failure', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await collectIn(directory, {
    additionalCollector: async () => ({
      events: [],
      sources: [{ id: 'broken', name: 'Broken source', url: 'https://example.test/broken', status: 'error', count: 0, checkedAt: NOW.toISOString(), error: 'timeout' }],
    }),
  });
  assert.ok(result.events.length > 0);
  assert.equal(result.sources.find((source) => source.id === 'bodik-osaka')?.status, 'success');
  assert.equal(result.sources.find((source) => source.id === 'broken')?.status, 'error');
  assert.equal(result.freshness, 'partial');
});

test('deduplicates cross-source records while retaining both provenance entries', () => {
  const one = normalizeEventRecord(fixtureEvent(1, { address: undefined }), {
    sourceId: 'source-a', sourceName: 'Source A', sourceUrl: 'https://a.example.test', checkedAt: NOW.toISOString(),
  });
  const two = normalizeEventRecord(fixtureEvent(1, { address: 'Osaka 1', officialUrl: 'https://b.example.test/same' }), {
    sourceId: 'source-b', sourceName: 'Source B', sourceUrl: 'https://b.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(one && two);
  const merged = dedupeEvents([one, two]);
  assert.equal(merged.length, 1);
  assert.deepEqual(new Set(merged[0].provenance.map((entry) => entry.sourceId)), new Set(['source-a', 'source-b']));

  const differentVenue = normalizeEventRecord(fixtureEvent(1, { venueName: 'Other venue', officialUrl: 'https://c.example.test/different' }), {
    sourceId: 'source-c', sourceName: 'Source C', sourceUrl: 'https://c.example.test', checkedAt: NOW.toISOString(),
  });
  assert.equal(dedupeEvents([one, differentVenue]).length, 2);

  const listingUrl = 'https://example.test/events/listing?page=1#section';
  const listingOne = normalizeEventRecord(fixtureEvent(2, { eventName: '別タイトル A', officialUrl: listingUrl, venueName: '同じ会場', address: '同じ住所' }), {
    sourceId: 'source-a', sourceName: 'Source A', sourceUrl: 'https://a.example.test', checkedAt: NOW.toISOString(),
  });
  const listingTwo = normalizeEventRecord(fixtureEvent(3, { eventName: '別タイトル B', officialUrl: listingUrl, venueName: '同じ会場', address: '同じ住所' }), {
    sourceId: 'source-b', sourceName: 'Source B', sourceUrl: 'https://b.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(listingOne && listingTwo);
  assert.equal(dedupeEvents([listingOne, listingTwo]).length, 2);

  const sameTitleVenueA = normalizeEventRecord(fixtureEvent(4, {
    eventName: '同じ催事名', venueName: '会場 A', address: '住所 A', officialUrl: listingUrl,
  }), {
    sourceId: 'source-a', sourceName: 'Source A', sourceUrl: 'https://a.example.test', checkedAt: NOW.toISOString(),
  });
  const sameTitleVenueB = normalizeEventRecord(fixtureEvent(5, {
    eventName: '同じ催事名', venueName: '会場 B', address: '住所 B', officialUrl: listingUrl,
  }), {
    sourceId: 'source-b', sourceName: 'Source B', sourceUrl: 'https://b.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(sameTitleVenueA && sameTitleVenueB);
  assert.equal(dedupeEvents([sameTitleVenueA, sameTitleVenueB]).length, 2);

  const punctuationA = normalizeEventRecord(fixtureEvent(6, {
    eventName: 'URL記号別催事', venueName: '同じ会場', address: '住所 A', officialUrl: 'https://example.test/events/listing?a-b',
  }), {
    sourceId: 'source-a', sourceName: 'Source A', sourceUrl: 'https://a.example.test', checkedAt: NOW.toISOString(),
  });
  const punctuationB = normalizeEventRecord(fixtureEvent(7, {
    eventName: 'URL記号別催事', venueName: '同じ会場', address: '住所 B', officialUrl: 'https://example.test/events/listing?ab',
  }), {
    sourceId: 'source-b', sourceName: 'Source B', sourceUrl: 'https://b.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(punctuationA && punctuationB);
  assert.equal(dedupeEvents([punctuationA, punctuationB]).length, 2);
});

test('keeps separate explicit start times and non-colliding IDs for the same live listing', () => {
  const common = {
    eventName: '同名ライブ公演',
    startDate: '2099-01-01',
    endDate: '2099-01-01',
    venueName: '同じライブ会場',
    address: '同じ住所',
    officialUrl: 'https://example.test/events/live-listing',
  };
  const daytime = normalizeEventRecord({ ...common, startTime: '12:00' }, {
    sourceId: 'live-a', sourceName: 'Live A', sourceUrl: 'https://live-a.example.test', checkedAt: NOW.toISOString(),
  });
  const nighttime = normalizeEventRecord({ ...common, startTime: '19:00' }, {
    sourceId: 'live-b', sourceName: 'Live B', sourceUrl: 'https://live-b.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(daytime && nighttime);
  assert.notEqual(daytime.id, nighttime.id);
  assert.equal(dedupeEvents([daytime, nighttime]).length, 2);

  const timeOmitted = normalizeEventRecord(common, {
    sourceId: 'live-c', sourceName: 'Live C', sourceUrl: 'https://live-c.example.test', checkedAt: NOW.toISOString(),
  });
  assert.ok(timeOmitted);
  assert.equal(dedupeEvents([daytime, timeOmitted]).length, 1);
});

test('rejects invalid dates, preserves events without usable coordinates, and never emits zero placeholders', () => {
  assert.equal(normalizeDate('2026-02-30'), undefined);
  assert.equal(normalizeDate('not-a-date'), undefined);
  assert.equal(validCoordinates('', ''), undefined);
  assert.equal(validCoordinates('NaN', '135.5'), undefined);
  assert.equal(validCoordinates('91', '135.5'), undefined);

  assert.equal(normalizeEventRecord(fixtureEvent(1, { startDate: '2026-02-30' }), { sourceId: 'fixture' }), null);
  assert.equal(normalizeEventRecord(fixtureEvent(1, { startDate: '2026-09-05', endDate: '2026-09-04' }), { sourceId: 'fixture' }), null);
  assert.equal(normalizeEventRecord(fixtureEvent(1, { endDate: '2026-02-30' }), { sourceId: 'fixture' }), null);
  assert.equal(rowToEvent({ 'イベント名': '不正終了日', '開始日': '2026-09-05', '終了日': '2026-02-30' }, NOW.toISOString()), null);
  const noMap = normalizeEventRecord(fixtureEvent(1, { latitude: '', longitude: '' }), { sourceId: 'fixture' });
  assert.ok(noMap);
  assert.equal('latitude' in noMap, false);
  assert.equal('longitude' in noMap, false);
});

test('classifies only explicit evidence and avoids celebrity/free/limited false positives', () => {
  const positive = classifyTags({
    name: '期間限定の親子イベント',
    description: '有名人の俳優が来場。展覧会を開催します。',
    price: '入場無料',
  });
  assert.deepEqual(positive.tags, ['celebrity', 'exhibition', 'family', 'free', 'limited']);
  for (const tag of positive.tags) assert.ok(positive.tagEvidence[tag]);

  const negative = classifyTags({
    description: '歌手を目指す講座。展示はありません。駐車場無料。小学生以下無料（大人有料）。数量限定・先着順。',
  });
  assert.deepEqual(negative.tags, []);

  const partialFree = normalizeEventRecord(fixtureEvent(2, {
    price: '駐車場無料（入場は有料）',
    freeEvent: true,
  }), { sourceId: 'fixture', checkedAt: NOW.toISOString() });
  assert.ok(partialFree);
  assert.equal(partialFree.freeEvent, false);
  assert.equal(partialFree.tags?.includes('free') ?? false, false);
});

test('does not classify a parking-fee campaign as a free event', () => {
  const event = rowToEvent({
    'イベント名': 'イオンモールの超!COOOOOOLなハック術',
    '開始日': '2026-07-02',
    '終了日': '2026-09-30',
    '場所名称': 'イオンモール茨木',
    '概要': '【夜】\n★16時以降、駐車場料金 無料キャンペーン\n詳細は コチラ',
  }, NOW.toISOString());
  assert.ok(event);
  assert.equal(event.freeEvent, null);
  assert.equal(event.tags?.includes('free') ?? false, false);
  assert.equal(event.tagEvidence?.free, undefined);
});

test('cached mode requires a normalized snapshot and never parses a raw fixture', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    collectEvents({
      cached: true,
      now: NOW,
      sourceCachePath: join(directory, 'sources', '270008_event.csv'),
      outputPath: join(directory, 'missing-events.json'),
      reportPath: join(directory, 'missing-report.json'),
      cacheReportPath: join(directory, 'sources', 'missing-report.json'),
      previousReportPath: join(directory, 'sources', 'missing-report.json'),
      fetchImpl: async () => { throw new Error('network must not be called'); },
    }),
    /正規化済みスナップショットがありません/,
  );
});

test('live collection stores the raw CSV with LF line endings', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceCachePath = join(directory, 'sources', '270008_event.csv');
  await collectEvents({
    now: NOW,
    fetchImpl: fixedBodikFetch(await readFile(sourceCachePath)),
    sourceCachePath,
    outputPath: join(directory, 'events.json'),
    reportPath: join(directory, 'report.json'),
    cacheReportPath: join(directory, 'sources', 'collection-report.json'),
    previousReportPath: join(directory, 'sources', 'collection-report.json'),
    additionalCollector: async () => ({ events: [], sources: [] }),
  });
  const stored = await readFile(sourceCachePath, 'utf8');
  assert.equal(stored.includes('\r'), false);
  assert.match(stored, /\n/);
});

test('times out while reading a provider response body', async () => {
  const fetchText = createFetchText({
    timeoutMs: 20,
    fetchImpl: async () => ({ ok: true, text: () => new Promise(() => {}) }),
  });
  await assert.rejects(fetchText('https://example.test/hanging-body'), /タイムアウトしました/);
});

test('restores a failed source from its own bounded last-good events as stale', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const saved = fixtureEvent(900, { sourceId: 'fixture-source', lastCheckedAt: NOW.toISOString() });
  const first = await collectIn(directory, {
    additionalCollector: async () => ({
      events: [saved],
      sources: [{ id: 'fixture-source', name: 'Fixture source', url: 'https://example.test/fixture', status: 'success', count: 1, checkedAt: NOW.toISOString() }],
    }),
  });
  assert.ok(first.events.some((event) => event.sourceId === 'fixture-source'));

  const second = await collectEvents({
    now: LATER,
    fetchImpl: fixedBodikFetch(await readFile(join(directory, 'sources', '270008_event.csv'))),
    sourceCachePath: join(directory, 'sources', '270008_event.csv'),
    outputPath: join(directory, 'events-second.json'),
    reportPath: join(directory, 'public-report-second.json'),
    cacheReportPath: join(directory, 'sources', 'collection-report.json'),
    previousReportPath: join(directory, 'sources', 'collection-report.json'),
    additionalCollector: async () => ({
      events: [],
      sources: [{ id: 'fixture-source', name: 'Fixture source', url: 'https://example.test/fixture', status: 'error', count: 0, checkedAt: LATER.toISOString(), error: 'temporary failure' }],
    }),
  });
  assert.ok(second.events.some((event) => event.sourceId === 'fixture-source'));
  assert.equal(second.sources.find((source) => source.id === 'fixture-source')?.status, 'stale');
});

test('does not extend a failed source cache from a newer duplicate provenance', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    sourceCachePath: join(directory, 'sources', '270008_event.csv'),
    outputPath: join(directory, 'events.json'),
    reportPath: join(directory, 'public-report.json'),
    cacheReportPath: join(directory, 'sources', 'collection-report.json'),
  };
  const oldCheckedAt = '2026-08-01T00:00:00.000Z';
  const duplicate = fixtureEvent(902, { address: 'same address', venueName: 'same venue' });
  const first = await collectEvents({
    now: NOW,
    fetchImpl: fixedBodikFetch(await readFile(paths.sourceCachePath)),
    ...paths,
    additionalCollector: async () => ({
      events: [
        { ...duplicate, sourceId: 'fresh-source', lastCheckedAt: NOW.toISOString() },
        { ...duplicate, sourceId: 'old-source', lastCheckedAt: oldCheckedAt },
      ],
      sources: [
        { id: 'fresh-source', name: 'Fresh', url: 'https://example.test/fresh', status: 'success', count: 1, checkedAt: NOW.toISOString() },
        { id: 'old-source', name: 'Old', url: 'https://example.test/old', status: 'success', count: 1, checkedAt: oldCheckedAt },
      ],
    }),
  });
  const merged = first.events.find((event) => event.eventName === duplicate.eventName);
  assert.ok(merged);
  assert.ok(merged.provenance?.some((entry) => entry.sourceId === 'old-source'));

  const second = await collectEvents({
    now: LATER,
    fetchImpl: fixedBodikFetch(await readFile(paths.sourceCachePath)),
    ...paths,
    outputPath: join(directory, 'events-second.json'),
    reportPath: join(directory, 'public-report-second.json'),
    additionalCollector: async () => ({
      events: [],
      sources: [
        { id: 'fresh-source', name: 'Fresh', url: 'https://example.test/fresh', status: 'error', count: 0, checkedAt: LATER.toISOString(), error: 'offline' },
        { id: 'old-source', name: 'Old', url: 'https://example.test/old', status: 'error', count: 0, checkedAt: LATER.toISOString(), error: 'offline' },
      ],
    }),
  });
  assert.equal(second.sources.find((source) => source.id === 'fresh-source')?.status, 'stale');
  assert.equal(second.sources.find((source) => source.id === 'fresh-source')?.count, 1);
  assert.equal(second.sources.find((source) => source.id === 'old-source')?.status, 'error');
  assert.equal(second.sources.find((source) => source.id === 'old-source')?.count, 0);
});

test('cached mode is deterministic and preserves a prior failure status', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    sourceCachePath: join(directory, 'sources', '270008_event.csv'),
    outputPath: join(directory, 'events.json'),
    reportPath: join(directory, 'public-report.json'),
    cacheReportPath: join(directory, 'sources', 'collection-report.json'),
  };
  const first = await collectEvents({
    now: NOW,
    fetchImpl: fixedBodikFetch(await readFile(paths.sourceCachePath)),
    ...paths,
    additionalCollector: async () => ({
      events: [],
      sources: [{ id: 'offline-source', name: 'Offline source', url: 'https://example.test/offline', status: 'error', count: 0, checkedAt: NOW.toISOString(), error: 'network down' }],
    }),
  });
  const second = await collectEvents({
    now: LATER,
    cached: true,
    fetchImpl: async () => { throw new Error('network must not be called'); },
    ...paths,
    additionalCollector: async () => ({
      events: [],
      sources: [{ id: 'offline-source', name: 'Offline source', url: 'https://example.test/offline', status: 'success', count: 0, checkedAt: LATER.toISOString() }],
    }),
  });
  assert.equal(second.sources.find((source) => source.id === 'offline-source')?.status, 'error');
  assert.notEqual(second.freshness, 'fresh');
  assert.equal(second.generatedAt, first.generatedAt);
  assert.equal(second.sources.find((source) => source.id === 'bodik-osaka')?.checkedAt, first.sources.find((source) => source.id === 'bodik-osaka')?.checkedAt);
});

test('live snapshot and cached build preserve event IDs, count, and checked timestamps', async (t) => {
  const directory = await fixtureDir();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    sourceCachePath: join(directory, 'sources', '270008_event.csv'),
    outputPath: join(directory, 'events.json'),
    reportPath: join(directory, 'public-report.json'),
    cacheReportPath: join(directory, 'sources', 'collection-report.json'),
  };
  const extra = fixtureEvent(901, { sourceId: 'stable-source', lastCheckedAt: NOW.toISOString() });
  const live = await collectEvents({
    now: NOW,
    fetchImpl: fixedBodikFetch(await readFile(paths.sourceCachePath)),
    ...paths,
    additionalCollector: async () => ({
      events: [extra],
      sources: [{ id: 'stable-source', name: 'Stable source', url: 'https://example.test/stable', status: 'success', count: 1, checkedAt: NOW.toISOString() }],
    }),
  });
  const liveShape = live.events.map((event) => [event.id, event.lastCheckedAt]);
  const cached = await collectEvents({
    now: LATER,
    cached: true,
    fetchImpl: async () => { throw new Error('network must not be called'); },
    ...paths,
  });
  assert.deepEqual(cached.events.map((event) => [event.id, event.lastCheckedAt]), liveShape);
  assert.equal(cached.events.length, live.events.length);
  assert.equal(cached.sources.find((source) => source.id === 'stable-source')?.status, 'success');
});

test('fails clearly when every provider fails and no bounded cache exists', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'osaka-event-no-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    collectEvents({
      now: NOW,
      fetchImpl: async () => { throw new Error('offline'); },
      sourceCachePath: join(directory, 'missing.csv'),
      outputPath: join(directory, 'missing-output.json'),
      reportPath: join(directory, 'report.json'),
      cacheReportPath: join(directory, 'report-cache.json'),
      additionalCollector: async () => ({ events: [], sources: [{ id: 'extra', name: 'Extra', url: 'https://example.test', status: 'error', error: 'offline' }] }),
    }),
    /全公式ソースの取得に失敗/,
  );
});

test('global last-good fallback applies the bound per event, not once per envelope', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'osaka-event-mixed-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const oldEvent = fixtureEvent(1, { sourceId: 'old-source', lastCheckedAt: '2026-08-01T00:00:00.000Z' });
  const newEvent = fixtureEvent(2, { sourceId: 'new-source', lastCheckedAt: '2026-09-03T00:00:00.000Z' });
  await writeFile(join(directory, 'events.json'), JSON.stringify({
    schemaVersion: 2,
    generatedAt: '2026-09-03T00:00:00.000Z',
    sources: [
      { id: 'old-source', name: 'Old', status: 'success', checkedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'new-source', name: 'New', status: 'success', checkedAt: '2026-09-03T00:00:00.000Z' },
    ],
    events: [oldEvent, newEvent],
  }));
  const result = await collectEvents({
    now: NOW,
    fetchImpl: async () => { throw new Error('offline'); },
    sourceCachePath: join(directory, 'missing.csv'),
    outputPath: join(directory, 'events.json'),
    reportPath: join(directory, 'report.json'),
    cacheReportPath: join(directory, 'cache-report.json'),
    additionalCollector: async () => ({ events: [], sources: [{ id: 'extra', name: 'Extra', url: 'https://example.test', status: 'error', error: 'offline' }] }),
  });
  assert.deepEqual(result.events.map((event) => event.sourceId), ['new-source']);
  assert.equal(result.freshness, 'stale');
});
