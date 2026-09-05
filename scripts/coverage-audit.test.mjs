import assert from 'node:assert/strict';
import test from 'node:test';

import { auditCoverage, discoverCandidatesFromHtml } from './audit-coverage.mjs';

const NOW = new Date('2026-09-05T00:00:00+09:00');
const registry = {
  scope: 'test',
  categories: [{ id: 'exhibition', label: '展覧会', sourceIds: ['ghibli'] }],
  venues: [{ id: 'atc', name: '大阪南港ATCギャラリー', sourceIds: ['ghibli'] }],
  sources: [{ id: 'ghibli', name: 'ジブリ公式', url: 'https://example.jp/ghibli' }],
  discoveryEntrypoints: [],
  candidateSeeds: [{ id: 'ghibli-2026', title: 'ジブリパーク展', priority: 'high', officialCandidateUrl: 'https://example.jp/ghibli', keywords: ['ジブリパーク展', '大阪南港ATCギャラリー'] }],
};
const collectionReport = { sources: [{ id: 'ghibli', name: 'ジブリ公式', url: 'https://example.jp/ghibli', status: 'success', count: 1, checkedAt: NOW.toISOString() }] };

test('high-interest candidate stays pending until a publishable official event exists', () => {
  const pending = auditCoverage({ registry, collectionReport, eventData: { events: [] }, now: NOW });
  assert.equal(pending.summary.highPriorityGaps, 1);
  assert.equal(pending.candidates[0].status, 'pending');

  const resolved = auditCoverage({ registry, collectionReport, now: NOW, eventData: { events: [{
    id: 'event-ghibli', eventName: 'ジブリパーク展', venueName: '大阪南港ATCギャラリー',
    startDate: '2026-07-18', endDate: '2026-09-26', officialUrl: 'https://example.jp/ghibli', sourceId: 'ghibli', category: 'exhibition',
  }] } });
  assert.equal(resolved.summary.highPriorityGaps, 0);
  assert.equal(resolved.candidates[0].status, 'resolved');
  assert.equal(resolved.candidates[0].matchedEventId, 'event-ghibli');
});

test('generic discovery entry links do not resolve candidates or become published events', () => {
  const candidates = discoverCandidatesFromHtml('<h2>秋の展覧会</h2><a href="/event/autumn">秋の展覧会 2026</a><a href="https://other.example/event">外部イベント</a>', {
    entry: { id: 'museum', name: '美術館公式', url: 'https://museum.example/events/' }, detectedAt: NOW.toISOString(),
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].officialCandidateUrl, 'https://museum.example/event/autumn');
  const report = auditCoverage({ registry: { ...registry, candidateSeeds: [] }, collectionReport: {}, eventData: { events: [] }, now: NOW, candidates });
  assert.equal(report.candidates[0].status, 'pending');
  assert.equal(report.summary.resolvedCandidates, 0);
});

test('previous candidates persist alongside maintained seeds during cached audits', () => {
  const report = auditCoverage({
    registry, collectionReport, eventData: { events: [] }, now: NOW,
    previousCoverage: { candidates: [{ id: 'prior', title: '公式公園の秋イベント', discoveredFrom: '公園公式', officialCandidateUrl: 'https://park.example/event/autumn', detectedAt: NOW.toISOString(), status: 'pending' }] },
  });
  assert.deepEqual(report.candidates.map((item) => item.id).sort(), ['ghibli-2026', 'prior']);
});
