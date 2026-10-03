import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectSeasonalGuides } from './seasonal-guides.mjs';

const now = new Date('2026-10-02T06:00:00Z');
const guide = { id: 'forecast', validThroughMonth: '2026-11', lastCheckedAt: '2026-10-01T06:00:00Z',
  fieldEvidence: { periodText: { text: '11月初旬〜下旬予想', sourceUrl: 'https://official.example/forecast', checkedAt: '2026-10-01T06:00:00Z' } } };
test('forecast remains undated and fresh only after quote verification', async () => {
  const [result] = await collectSeasonalGuides({ now, guides: [guide], fetchText: async () => '<p>11月初旬〜下旬予想</p>' });
  assert.equal(result.sourceStatus, 'success');
  assert.equal(result.lastCheckedAt, now.toISOString());
  assert.equal('startDate' in result, false);
});
test('changed official evidence withdraws the forecast instead of publishing saved dates', async () => {
  assert.deepEqual(await collectSeasonalGuides({ now, guides: [guide], fetchText: async () => '開催中止' }), []);
});
test('network failures retain only a bounded stale snapshot without minting verification dates', async () => {
  const fail = async () => { throw new Error('offline'); };
  const [result] = await collectSeasonalGuides({ now, guides: [guide], fetchText: fail });
  assert.equal(result.sourceStatus, 'stale');
  assert.equal(result.lastCheckedAt, guide.lastCheckedAt);
  assert.deepEqual(await collectSeasonalGuides({ now: new Date('2026-10-17'), guides: [guide], fetchText: fail }), []);
});
test('expired and accidentally dated guides never publish', async () => {
  assert.deepEqual(await collectSeasonalGuides({ now: new Date('2026-12-01'), guides: [guide], fetchText: async () => '11月初旬〜下旬予想' }), []);
  assert.deepEqual(await collectSeasonalGuides({ now, guides: [{ ...guide, startDate: '2026-11-01' }], fetchText: async () => '11月初旬〜下旬予想' }), []);
});
