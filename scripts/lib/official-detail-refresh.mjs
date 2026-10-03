import assert from 'node:assert/strict';
import { normalizeEventRecord, normalize } from './events.mjs';
import { publicationIssues } from './quality.mjs';

const ALLOWED = {
  'verified-outings-mucha-returns-2026': ['schedule', 'startTime', 'endTime', 'timeInfo', 'closureInfo', 'price'],
  'official-pack-a-kuboso-western-paintings-2026': ['price'],
  'information-pack-b-banpaku-night-sky-art-fireworks-2026-11-21': ['price', 'timeInfo', 'startTime', 'accessByTransit'],
  'verified-outings-citysup-nakanoshima-guided-tour': ['price', 'timeInfo', 'reservationInfo'],
};

/** Apply this bounded official supplement without rerunning collection or
 * claiming that old calendars, source statuses or event timestamps are fresh. */
export function applyOfficialDetailUpdates(events, updates, { now = new Date() } = {}) {
  assert.equal(updates.length, 4);
  assert.equal(new Set(updates.map(item => item.match.sourceId)).size, 4);
  const changes = new Map();
  for (const update of updates) {
    const { match, fields, fieldEvidence } = update;
    const allowed = ALLOWED[match.sourceId];
    assert.ok(allowed, 'Unapproved supplement source.');
    assert.ok(Object.keys(fields).every(key => allowed.includes(key)), 'Unapproved detail field.');
    const matches = events.filter(event => event.sourceId === match.sourceId && normalize(event.eventName) === normalize(match.eventName)
      && event.officialUrl === match.officialUrl && (match.calendarDetailsOnly
        || (event.startDate === match.startDate && event.endDate === match.endDate)));
    assert.equal(matches.length, 1, 'Official supplement identity must match exactly one existing event.');
    const event = matches[0];
    if (match.calendarDetailsOnly) {
      assert.equal(match.sourceId, 'verified-outings-citysup-nakanoshima-guided-tour');
      assert.ok(event.schedule?.dates?.length, 'Daytime calendar snapshot is required.');
      const age = new Date(now).getTime() - new Date(event.lastCheckedAt).getTime();
      assert.ok(age >= 0 && age <= 14 * 86400000, 'Calendar snapshot has expired.');
      for (const date of event.schedule.dates) {
        const quote = event.fieldEvidence?.[`schedule_${date}`];
        assert.ok(quote?.sourceUrl?.startsWith('https://citysup.urkt.in/api/direct/courses/21947/calendars?')
          && quote.text === `"date":"${date}","status":"realtime"`, 'Each existing booking date needs its own verified calendar proof.');
      }
    }
    for (const key of Object.keys(fields)) assert.ok(fieldEvidence[key], `Missing proof for ${key}`);
    for (const [key, quote] of Object.entries(fieldEvidence)) {
      assert.ok(quote.text && /^https:\/\//u.test(quote.sourceUrl));
      assert.ok(!/^schedule_/u.test(key), 'Calendar evidence may not be replaced.');
      const age = new Date(now).getTime() - new Date(quote.checkedAt).getTime();
      assert.ok(age >= 0 && age <= 14 * 86400000, `Expired or future detail proof: ${key}`);
    }
    const normalized = normalizeEventRecord({ ...event, ...fields, freeEvent: undefined,
      tags: (event.tags ?? []).filter(tag => tag !== 'free'),
      tagEvidence: Object.fromEntries(Object.entries(event.tagEvidence ?? {}).filter(([key]) => key !== 'free')),
    });
    assert.ok(normalized);
    const after = { ...event, ...Object.fromEntries(Object.keys(fields).map(key => [key, normalized[key]])),
      fieldEvidence: { ...event.fieldEvidence, ...fieldEvidence },
    };
    if (Object.hasOwn(fields, 'startTime')) after.startAt = normalized.startAt;
    if (Object.hasOwn(fields, 'endTime')) after.endAt = normalized.endAt;
    if (Object.hasOwn(fields, 'price')) {
      after.freeEvent = normalized.freeEvent;
      after.tags = [...(event.tags ?? []).filter(tag => tag !== 'free'), ...((normalized.tags ?? []).includes('free') ? ['free'] : [])];
      after.tagEvidence = Object.fromEntries(Object.entries(event.tagEvidence ?? {}).filter(([key]) => key !== 'free'));
      if (normalized.tagEvidence?.free) after.tagEvidence.free = normalized.tagEvidence.free;
    }
    const mutable = [...allowed, 'startAt', 'endAt', 'freeEvent', 'tags', 'tagEvidence', 'fieldEvidence'];
    const protectedPart = value => Object.fromEntries(Object.entries(value).filter(([key]) => !mutable.includes(key)));
    assert.deepEqual(protectedPart(after), protectedPart(event), 'Identity, dates, images, status and timestamps must remain unchanged.');
    if (match.calendarDetailsOnly) assert.deepEqual(after.schedule, event.schedule);
    assert.deepEqual(publicationIssues(after), [], 'Updated target must remain publishable.');
    changes.set(event.id, after);
  }
  return events.map(event => changes.get(event.id) ?? event);
}
