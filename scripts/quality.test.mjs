import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEventRecord } from './lib/events.mjs';
import { partitionPublishable, publicationIssues, qualitySummary } from './lib/quality.mjs';

const CHECKED = '2026-09-17T00:00:00.000Z';

function event(overrides = {}) {
  return normalizeEventRecord({
    eventName: '公式イベント',
    venueName: '大阪の会場',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    officialUrl: 'https://example.test/event',
    sourceId: 'official-source',
    ...overrides,
  }, {
    sourceId: 'official-source',
    sourceName: '公式情報源',
    sourceUrl: 'https://example.test/',
    checkedAt: CHECKED,
  });
}

test('publication gate requires official provenance, checked time and venue evidence', () => {
  const valid = event();
  assert.deepEqual(publicationIssues(valid), []);
  const missingVenue = event({ venueName: undefined, address: undefined, latitude: undefined, longitude: undefined });
  assert.deepEqual(publicationIssues(missingVenue), ['venue_evidence']);
  const missingOfficial = { ...valid, officialUrl: undefined };
  assert.deepEqual(publicationIssues(missingOfficial), ['official_url']);
  const missingCheck = { ...valid, lastCheckedAt: undefined };
  assert.deepEqual(publicationIssues(missingCheck), ['checked_at']);
});

test('quality summary reports rejected reasons and field coverage', () => {
  const valid = event({ description: '公式説明', startTime: '10:00', endTime: '12:00' });
  const invalid = event({ venueName: undefined });
  const partition = partitionPublishable([valid, invalid]);
  assert.equal(partition.accepted.length, 1);
  assert.equal(partition.rejected.length, 1);
  const summary = qualitySummary(partition.accepted, { rejected: partition.rejected });
  assert.equal(summary.published, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.rejectionReasons.venue_evidence, 1);
  assert.deepEqual(summary.fields.startTime, { count: 1, percentage: 100 });
  assert.deepEqual(summary.fields.price, { count: 0, percentage: 0 });
});

test('normalization preserves explicit closed dates and discards invalid ones', () => {
  const normalized = event({ schedule: { closedDates: ['2026-09-21', 'not-a-date'], dates: ['2026-09-20'], evidence: '公式休催日' } });
  assert.deepEqual(normalized.schedule, {
    evidence: '公式休催日',
    closedDates: ['2026-09-21'],
    dates: ['2026-09-20'],
  });
});
