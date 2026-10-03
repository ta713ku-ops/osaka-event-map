import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { applyOfficialDetailUpdates } from './lib/official-detail-refresh.mjs';

const pack = JSON.parse(readFileSync(new URL('../data/information-supplement-integrated-20261003.json', import.meta.url), 'utf8'));
const now = new Date('2026-10-03T05:00:00Z');
function fixtures() {
  return pack.updates.map((update, index) => ({
    id: `old-id-${index}`, routeId: `old-route-${index}`, ...update.match,
    startDate: update.match.startDate ?? '2026-10-07', endDate: update.match.endDate ?? '2026-10-31',
    venueName: '公式会場', lastCheckedAt: '2026-10-02T12:20:30.504Z',
    imageUrl: 'https://example.org/verified-hero.jpg', status: 'scheduled',
    freeEvent: true, tags: ['free'], tagEvidence: { free: 'old inferred flag' },
    fieldEvidence: { oldCalendar: { sourceUrl: 'https://citysup.urkt.in/calendar', text: '2026-10-07 realtime', checkedAt: '2026-10-02T12:20:30.504Z' },
      ...(update.match.calendarDetailsOnly ? Object.fromEntries(['2026-10-07', '2026-10-31'].map(date => [`schedule_${date}`, {
        sourceUrl: 'https://citysup.urkt.in/api/direct/courses/21947/calendars?start_date=2026-10-02', text: `"date":"${date}","status":"realtime"`, checkedAt: '2026-10-02T12:20:30.504Z',
      }])) : {}),
    },
    ...(update.match.calendarDetailsOnly ? { schedule: { dates: ['2026-10-07', '2026-10-31'] }, sourceStatus: 'stale' } : {}),
  }));
}
test('official detail refresh preserves routes, calendar evidence, images, status and collection timestamps', () => {
  const before = [...fixtures(), { id: 'unrelated', arbitrary: { nested: true } }];
  const after = applyOfficialDetailUpdates(before, pack.updates, { now });
  assert.deepEqual(after.at(-1), before.at(-1));
  for (let i = 0; i < 4; i++) {
    for (const key of ['id', 'routeId', 'startDate', 'endDate', 'lastCheckedAt', 'imageUrl', 'status', 'sourceStatus']) assert.deepEqual(after[i][key], before[i][key]);
    assert.deepEqual(after[i].fieldEvidence.oldCalendar, before[i].fieldEvidence.oldCalendar);
    assert.equal(after[i].freeEvent, false);
    assert.ok(!after[i].tags.includes('free'));
  }
  assert.ok(after[0].schedule.closedDates.includes('2026-11-04'));
  assert.ok(!after[0].schedule.closedDates.includes('2026-11-02'));
  assert.deepEqual(after[3].schedule, before[3].schedule);
  assert.equal(after[3].startTime, undefined);
  assert.equal(after[3].endTime, undefined);
  assert.equal(after[2].endTime, undefined);
});
test('official supplement rejects changed identity, unexpected fields and expired detail proof', () => {
  const changed = fixtures(); changed[0].officialUrl += 'different';
  assert.throws(() => applyOfficialDetailUpdates(changed, pack.updates, { now }), /identity/u);
  const scope = structuredClone(pack.updates); scope[3].fields.schedule = { dates: ['2026-10-08'] };
  assert.throws(() => applyOfficialDetailUpdates(fixtures(), scope, { now }), /Unapproved detail field/u);
  assert.throws(() => applyOfficialDetailUpdates(fixtures(), pack.updates, { now: new Date('2026-11-01T00:00:00Z') }), /Expired/u);
});
