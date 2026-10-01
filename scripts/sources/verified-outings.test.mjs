import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __test__,
  normalizeEvidenceText,
  occurrenceIdentityKey,
  validateOccurrenceEvidence,
  visibleText,
} from './verified-outings.mjs';

const OCCURRENCE = __test__.DATA.occurrences[0];
const NOW = new Date('2026-09-29T13:00:00+09:00');
const CHECKED_AT = '2026-09-29T04:00:00.000Z';

function evidenceFixture(occurrence = OCCURRENCE, { omit } = {}) {
  const facts = [...__test__.REQUIRED_EVIDENCE_FIELDS, ...(occurrence.address ? ['address'] : [])]
    .filter((field) => field !== omit)
    .map((field) => `<p>${occurrence.fieldEvidence[field].text}</p>`)
    .join('');
  return `<html><body><main>${facts}</main><script>${occurrence.fieldEvidence.eventName.text}</script></body></html>`;
}

test('visible-text parser decodes entities, ignores script text, and matches each stored field', () => {
  assert.equal(visibleText('<p>Ａ＆Ｂ&nbsp;大阪</p><script>hidden</script>'), 'A&B 大阪');
  const html = evidenceFixture();
  const pages = new Map([[OCCURRENCE.officialUrl, html]]);
  assert.deepEqual(validateOccurrenceEvidence(pages, OCCURRENCE), { valid: true, missing: [] });
  assert.equal(normalizeEvidenceText('  ２０２６年 ９月 '), '2026年9月');

  const changedDate = { ...OCCURRENCE, fieldEvidence: { ...OCCURRENCE.fieldEvidence, dateRange: {
    ...OCCURRENCE.fieldEvidence.dateRange,
    text: '2026年10月1日～10月2日',
  } } };
  assert.deepEqual(validateOccurrenceEvidence(pages, changedDate), { valid: false, missing: ['dateRange'] });
  const changedAddress = { ...OCCURRENCE, fieldEvidence: { ...OCCURRENCE.fieldEvidence, address: {
    ...OCCURRENCE.fieldEvidence.address,
    text: '公式ページから消えた所在地',
  } } };
  assert.deepEqual(validateOccurrenceEvidence(pages, changedAddress), { valid: false, missing: ['address'] });
});

test('occurrence identity is stable across punctuation and spacing, but distinct dates remain distinct', () => {
  const key = occurrenceIdentityKey(OCCURRENCE);
  assert.equal(occurrenceIdentityKey({
    ...OCCURRENCE,
    eventName: '空 庭・妖怪祭',
    venueName: '空庭温泉　OSAKA BAY TOWER',
  }), key);
  assert.notEqual(occurrenceIdentityKey({ ...OCCURRENCE, endDate: '2026-10-01' }), key);
  assert.equal(__test__.assertDataset([OCCURRENCE]).length, 1);
  assert.throws(() => __test__.assertDataset([OCCURRENCE, OCCURRENCE]), /duplicate verified sourceId/u);
});

test('failed fetch retains the last verified timestamp and reports a stale occurrence', async () => {
  const result = await __test__.collectOccurrence({
    now: NOW,
    checkedAt: CHECKED_AT,
    fetchText: async () => { throw new Error('offline'); },
  }, OCCURRENCE);

  assert.equal(result.recognized, true);
  assert.equal(result.events.length, 1);
  assert.match(result.errors[0], /last verified timestamp/u);
  assert.equal(result.events[0].lastCheckedAt, OCCURRENCE.lastCheckedAt);
  assert.ok(Object.values(result.events[0].fieldEvidence).every((field) => field.checkedAt === OCCURRENCE.lastCheckedAt));
  assert.notEqual(result.events[0].lastCheckedAt, CHECKED_AT);
});

test('successful revalidation refreshes evidence timestamps; changed official facts do not use stale fallback', async () => {
  const current = await __test__.collectOccurrence({
    now: NOW,
    checkedAt: CHECKED_AT,
    fetchText: async () => evidenceFixture(),
  }, OCCURRENCE);
  assert.equal(current.errors.length, 0);
  assert.equal(current.events[0].lastCheckedAt, CHECKED_AT);
  assert.equal(current.events[0].address, OCCURRENCE.address);
  assert.ok(Object.values(current.events[0].fieldEvidence).every((field) => field.checkedAt === CHECKED_AT));

  const changed = await __test__.collectOccurrence({
    now: NOW,
    checkedAt: CHECKED_AT,
    fetchText: async () => evidenceFixture(OCCURRENCE, { omit: 'venueName' }),
  }, OCCURRENCE);
  assert.equal(changed.events.length, 0);
  assert.deepEqual(changed.errors, ['official page no longer contains verified fields: venueName']);
  assert.equal(changed.recognized, false);
});

test('past occurrences expire in Osaka time without fetching or emitting snapshot data', async () => {
  let fetchCount = 0;
  const result = await __test__.collectOccurrence({
    now: new Date('2026-10-01T00:00:00+09:00'),
    fetchText: async () => { fetchCount += 1; return evidenceFixture(); },
  }, OCCURRENCE);
  assert.deepEqual(result, { events: [], errors: [], recognized: true, allowCachedFallback:false });
  assert.equal(fetchCount, 0);
});

test('failed fetch never publishes a future checkedAt or extends a fourteen-day snapshot lease',async()=>{
 const fetchText=async()=>{throw new Error('offline');};
 const future=await __test__.collectOccurrence({now:new Date('2026-09-28T12:00:00+09:00'),fetchText},OCCURRENCE);
 const old=await __test__.collectOccurrence({now:NOW,fetchText},{...OCCURRENCE,lastCheckedAt:'2026-09-01T00:00:00Z'});
 assert.equal(future.events.length,0);assert.equal(old.events.length,0);
});

test('CitySUP publishes only a dated official booking slot, never an inferred tour period', async () => {
  const page = '<main><h1>水上さんぽガイドツアー 中之島公園ぐるっと</h1><p>ばらぞの橋 桟橋</p><p>大阪市北区中之島1丁目1</p><p>中之島公園のまわりをぐるりと一周します。</p><p>平日 1,500円（税込1,650円）</p><p>予約優先、当日現地受付あり</p><p>大阪メトロ堺筋線「北浜」駅</p><p>雨天でも開催しますが、警報発令時などスタッフが危険と判断した場合は中止します</p></main>';
  const collect = (days) => __test__.collectCitySup({
    now: new Date('2026-09-30T18:00:00+09:00'), checkedAt: '2026-09-30T09:00:00.000Z',
    fetchText: async (url) => url.includes('citysup.urkt.in') ? JSON.stringify(days) : page,
  });
  const found = await collect([
    { date: '2026-09-30', status: 'full' },
    { date: '2026-10-01', status: 'realtime' },
    { date: '2026-10-02', status: 'realtime' },
  ]);
  assert.equal(found.events.length, 1);
  assert.equal(found.events[0].startDate, '2026-10-01');
  assert.equal(found.events[0].endDate, '2026-10-01');
  assert.equal(found.events[0].fieldEvidence.dateRange.text, '"date":"2026-10-01"');
  assert.equal(found.events[0].lastCheckedAt, '2026-09-30T09:00:00.000Z');
  const full = await collect([{ date: '2026-10-01', status: 'full' }]);
  assert.equal(full.events.length, 0);
});

test('SCRAP uses a verified bookable date when the landing page drops its old end date', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-jikken-lab-osaka-2026');
  const page = `${evidenceFixture(occurrence, { omit: 'dateRange' })}<p>2026年5月21日(木)〜</p><p>一般 : 前売券 2,300円 / 当日券 2,600円</p><p>小学生以上のご参加には必ずチケットが必要です</p><p>本イベントはスクラップチケットでのみご購入ができます</p><p>会場に駐車場、駐輪場はございません</p>`;
  const fetchText = async () => page;
  fetchText.request = async (url, options) => url.includes('csrf_token')
    ? { text: JSON.stringify({ token_name: 'csrf_scrapticket_name', csrf_hash: 'fixture' }), headers: { getSetCookie: () => ['scrapticket_csrf_cookie_name=fixture; Path=/'] } }
    : { text: JSON.stringify({ result: 'OK', target_month: options.body.get('target_month'), days: {
      '2026-10-01': { cell: 'available', selectable: true },
    } }) };
  const result = await __test__.collectScrapCalendar({
    now: new Date('2026-09-30T18:00:00+09:00'), checkedAt: '2026-09-30T09:00:00.000Z', fetchText,
  }, occurrence);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].startDate, '2026-10-01');
  assert.equal(result.events[0].endDate, '2026-10-01');
  assert.equal(result.events[0].fieldEvidence.dateRange.sourceUrl, 'https://scrapticket.jp/ajax/events_calendar/month_summary');
});
