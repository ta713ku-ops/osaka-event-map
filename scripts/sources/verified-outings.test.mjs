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
  const facts = Object.keys(occurrence.fieldEvidence)
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
  assert.equal(result.allowCachedFallback, false);
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

test('CitySUP keeps all verified booking dates and does not interpolate unavailable days', async () => {
  const page = '<main><h1>水上さんぽガイドツアー 中之島公園ぐるっと</h1><p>ばらぞの橋 桟橋</p><p>大阪市北区中之島1丁目1</p><p>中之島公園のまわりをぐるりと一周します。</p><p>デイタイム |昼〜夕 大人 |中学生以上 平日 1,500円 (税込1,650円) 土日祝 2,000円 (税込2,200円) 小人 |小学生以下 平日 1,000円 (税込1,100円) 土日祝 1,500円 (税込1,650円)</p><p>※14日前のご予約で 10%OFF 、7日前までのご予約で 5%OFF に!</p><p>所要時間 デイタイム 約20分</p><p>参加条件 3才以上(小学生以下は大人と一緒に参加),ライフジャケット着用(無料貸出),10月まではペット同乗可 お申込み ・予約優先、当日現地受付あり ※時間帯により混み合いますので事前予約がおすすめ ・早めの事前予約でお得な 割引価格 に!</p><p>現地受付|クレジットカード・QRコード・交通系ICカード等(現金不可)</p><p>大阪メトロ堺筋線「北浜」駅</p><p>雨天でも開催しますが、警報発令時などスタッフが危険と判断した場合は中止します</p></main>';
  const collect = (days) => __test__.collectCitySup({
    now: new Date('2026-09-30T18:00:00+09:00'), checkedAt: '2026-09-30T09:00:00.000Z',
    fetchText: async (url) => url.includes('citysup.urkt.in') ? JSON.stringify(days) : page,
  });
  const found = await collect([
    { date: '2026-09-30', status: 'full' },
    { date: '2026-10-01', status: 'realtime' },
    { date: '2026-10-02', status: 'realtime' },
    { date: '2026-10-03', status: 'full' },
    { date: '2026-10-04', status: 'realtime' },
    { date: '2026-11-30', status: 'realtime' },
  ]);
  assert.equal(found.events.length, 1);
  assert.equal(found.events[0].startDate, '2026-10-01');
  assert.equal(found.events[0].endDate, '2026-10-04');
  assert.deepEqual(found.events[0].schedule.dates, ['2026-10-01', '2026-10-02', '2026-10-04']);
  assert.match(found.events[0].fieldEvidence['schedule_2026-10-04'].text, /2026-10-04/u);
  assert.equal(found.events[0].lastCheckedAt, '2026-09-30T09:00:00.000Z');
  assert.match(found.events[0].price, /小人（小学生以下）平日1,100円／土日祝1,650円/u);
  assert.match(found.events[0].reservationInfo, /3才以上、小学生以下は大人と一緒/u);
  assert.equal(found.events[0].startTime, undefined);
  assert.equal(found.events[0].endTime, undefined);
  const full = await collect([{ date: '2026-10-01', status: 'full' }]);
  assert.equal(full.events.length, 0);
  assert.equal(full.allowCachedFallback, false);
  const empty = await collect([]);
  assert.equal(empty.allowCachedFallback, false);
});

test('Mucha exhibition retains every official closure and holiday opening through November', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-mucha-returns-2026');
  const result = await __test__.collectOccurrence({
    now: new Date('2026-10-03T05:00:00Z'),
    fetchText: async () => evidenceFixture(occurrence),
  }, occurrence);
  const event = result.events[0];
  assert.equal(event.schedule.daily, true);
  assert.deepEqual(event.schedule.closedDates, [
    '2026-08-03', '2026-08-17', '2026-08-24', '2026-08-31',
    '2026-09-07', '2026-09-14', '2026-09-28',
    '2026-10-05', '2026-10-13', '2026-10-19', '2026-10-26',
    '2026-11-04', '2026-11-09', '2026-11-16', '2026-11-24',
  ]);
  for (const date of ['2026-08-10', '2026-09-21', '2026-10-12', '2026-11-02', '2026-11-23']) {
    assert.ok(!event.schedule.closedDates.includes(date), `${date} is explicitly open`);
  }
  assert.equal(event.startTime, '09:30');
  assert.equal(event.endTime, '17:15');
  assert.match(event.fieldEvidence.schedule.text, /11月2日・23日は開館/u);
  assert.match(event.fieldEvidence.closureInfo.text, /11月4日・24日/u);
  assert.equal(event.freeEvent, false);
  const changed = await __test__.collectOccurrence({
    now: new Date('2026-10-03T05:00:00Z'),
    fetchText: async () => evidenceFixture(occurrence, { omit: 'closureInfo' }).replaceAll(occurrence.fieldEvidence.schedule.text, ''),
  }, occurrence);
  assert.equal(changed.events.length, 0);
  assert.ok(changed.errors[0].includes('schedule'));
});

test('Kuboso uses this exhibition flyer fee and keeps the manually read PDF dated', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'official-pack-a-kuboso-western-paintings-2026');
  const fetchText = async () => evidenceFixture(occurrence);
  fetchText.assetHash = async () => occurrence.evidenceAssets[0].sha256;
  const result = await __test__.collectOccurrence({ now: new Date('2026-10-03T05:00:00Z'), fetchText }, occurrence);
  assert.match(result.events[0].price, /一般1,000円／高大生600円／中学生以下無料/u);
  assert.equal(result.events[0].freeEvent, false);
  assert.equal(result.events[0].fieldEvidence.price.evidenceKind, 'pdf');
  assert.equal(result.events[0].fieldEvidence.price.checkedAt, occurrence.fieldEvidence.price.checkedAt);
  assert.match(result.errors[0], /manually reviewed snapshot/u);
  fetchText.assetHash = async () => 'changed';
  assert.equal((await __test__.collectOccurrence({ now: new Date('2026-10-03T05:00:00Z'), fetchText }, occurrence)).events.length, 0);
});

test('SCRAP confirmed empty calendars withdraw old days while unrecognized responses stay errors', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-jikken-lab-osaka-2026');
  const fetchText = async () => `${evidenceFixture(occurrence, { omit: 'dateRange' })}<p>2026年5月21日(木)〜</p>`;
  let invalid = false;
  fetchText.request = async (url, options) => url.includes('csrf_token')
    ? { text: JSON.stringify({ token_name: 'csrf_scrapticket_name', csrf_hash: 'fixture' }), headers: { getSetCookie: () => ['scrapticket_csrf_cookie_name=fixture; Path=/'] } }
    : { text: JSON.stringify({ result: invalid ? 'ERROR' : 'OK', target_month: options.body.get('target_month'), days: { '2026-10-03': { cell: 'full', selectable: true }, '2026-10-04': { cell: 'available', selectable: false } } }) };
  const context = { now: new Date('2026-10-01T18:00:00+09:00'), fetchText };
  const empty = await __test__.collectScrapCalendar(context, occurrence);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.recognized, true);
  assert.equal(empty.allowCachedFallback, false);
  invalid = true;
  await assert.rejects(__test__.collectScrapCalendar(context, occurrence), /calendar response was not recognized/u);
});

test('SCRAP keeps multiple verified dates across months without inferring gaps', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-jikken-lab-osaka-2026');
  const page = `${evidenceFixture(occurrence, { omit: 'dateRange' })}<p>2026年5月21日(木)〜</p><p>一般 : 前売券 2,300円 / 当日券 2,600円</p><p>小学生以上のご参加には必ずチケットが必要です</p><p>本イベントはスクラップチケットでのみご購入ができます</p><p>会場に駐車場、駐輪場はございません</p>`;
  const fetchText = async () => page;
  fetchText.request = async (url, options) => url.includes('csrf_token')
    ? { text: JSON.stringify({ token_name: 'csrf_scrapticket_name', csrf_hash: 'fixture' }), headers: { getSetCookie: () => ['scrapticket_csrf_cookie_name=fixture; Path=/'] } }
    : { text: JSON.stringify({ result: 'OK', csrf_hash: 'private-rotating-fixture', target_month: options.body.get('target_month'), days: options.body.get('target_month') === '2026-10' ? {
      '2026-10-03': { cell: 'available', selectable: true },
      '2026-10-04': { cell: 'available', selectable: true },
      '2026-10-05': { cell: 'available', selectable: false },
      '2026-10-06': { cell: 'full', selectable: true },
    } : { '2026-11-01': { cell: 'available', selectable: true }, '2026-11-02': { cell: 'available', selectable: true } } }) };
  const result = await __test__.collectScrapCalendar({
    now: new Date('2026-10-01T18:00:00+09:00'), checkedAt: '2026-10-01T09:00:00.000Z', fetchText,
  }, occurrence);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].startDate, '2026-10-03');
  assert.equal(result.events[0].endDate, '2026-11-01');
  assert.deepEqual(result.events[0].schedule.dates, ['2026-10-03', '2026-10-04', '2026-11-01']);
  assert.equal(result.events[0].fieldEvidence.dateRange.sourceUrl, 'https://scrapticket.jp/ajax/events_calendar/month_summary');
  assert.equal(result.events[0].fieldEvidence['schedule_2026-11-01'].text, '"2026-11-01"');
  assert.doesNotMatch(JSON.stringify(result.events), /private-rotating-fixture|csrf_hash/u);
});

test('SCRAP refreshes dates without replacing reviewed fees, child conditions, access or closures', async () => {
  const occurrence = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-jikken-lab-osaka-2026');
  const urls = [];
  const page = `${evidenceFixture(occurrence, { omit: 'dateRange' })}<p>2026年5月21日(木)〜</p><p>小学生以上のご参加には必ずチケットが必要です</p><p>会場に駐車場、駐輪場はございません</p>`;
  const fetchText = async (url) => { urls.push(url); return page; };
  fetchText.request = async (url, options) => url.includes('csrf_token')
    ? { text: JSON.stringify({ token_name: 'csrf_scrapticket_name', csrf_hash: 'fixture' }), headers: { getSetCookie: () => ['scrapticket_csrf_cookie_name=fixture; Path=/'] } }
    : { text: JSON.stringify({ result: 'OK', target_month: options.body.get('target_month'), days: {
      '2026-10-13': { cell: 'available', selectable: true },
      '2026-10-14': { cell: 'available', selectable: true },
      '2026-10-15': { cell: 'available', selectable: true },
      '2026-10-16': { cell: 'available', selectable: true },
    } }) };
  const result = await __test__.collectScrapCalendar({ now: new Date('2026-10-12T09:00:00Z'), fetchText }, occurrence);
  const event = result.events[0];
  assert.deepEqual(event.schedule.dates, ['2026-10-13', '2026-10-16']);
  assert.deepEqual(event.schedule.closedDates, ['2026-10-14', '2026-10-15']);
  assert.equal(event.price, occurrence.price);
  assert.equal(event.reservationInfo, occurrence.reservationInfo);
  assert.equal(event.accessByTransit, occurrence.accessByTransit);
  assert.equal(event.fieldEvidence.price.text, occurrence.fieldEvidence.price.text);
  assert.equal(event.fieldEvidence.scheduledClosures.text, occurrence.fieldEvidence.schedule.text);
  assert.ok(urls.includes(occurrence.fieldEvidence.transitRoute.sourceUrl));
  assert.equal(event.endTime, undefined);
});

test('structured times and schedules survive publication and each optional evidence URL is fetched', async () => {
  const extraUrl = 'https://official.example.test/times';
  const evidence = { sourceUrl: extraUrl, text: '10月3日・10月4日 17:30～22:00', checkedAt: CHECKED_AT };
  const occurrence = { ...OCCURRENCE, startDate: '2026-10-03', endDate: '2026-10-04', startTime: '17:30', endTime: '22:00', timeInfo: '17:30～22:00', closureInfo: '指定日開催', contact: { name: '公式事務局', phone: '06-1234-5678' }, reservationUrl: 'https://official.example.test/book', nearestStation: '公式駅', accessByCar: '公式道路', schedule: { dates: ['2026-10-03', '2026-10-04'], evidence: evidence.text }, fieldEvidence: { ...OCCURRENCE.fieldEvidence, startTime: evidence, endTime: evidence, timeInfo: evidence, closureInfo: evidence, contact: evidence, reservationUrl: evidence, nearestStation: evidence, accessByCar: evidence, schedule: evidence } };
  const urls = [];
  const result = await __test__.collectOccurrence({ now: NOW, checkedAt: CHECKED_AT, fetchText: async (url) => { urls.push(url); return url === extraUrl ? evidence.text : evidenceFixture(); } }, occurrence);
  assert.deepEqual(urls.sort(), [occurrence.officialUrl, extraUrl].sort());
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].startTime, '17:30');
  assert.equal(result.events[0].endTime, '22:00');
  assert.equal(result.events[0].timeInfo, '17:30~22:00');
  assert.equal(result.events[0].closureInfo, '指定日開催');
  assert.deepEqual(result.events[0].contact, occurrence.contact);
  assert.equal(result.events[0].reservationUrl, occurrence.reservationUrl);
  assert.equal(result.events[0].nearestStation, occurrence.nearestStation);
  assert.equal(result.events[0].accessByCar, occurrence.accessByCar);
  assert.deepEqual(result.events[0].schedule.dates, ['2026-10-03', '2026-10-04']);
  const { startTime: removedEvidence, ...withoutStartTime } = occurrence.fieldEvidence;
  assert.throws(() => __test__.assertDataset([{ ...occurrence, fieldEvidence: withoutStartTime }]), /missing startTime evidence/u);
});

test('night boat uses its separate venue and booking calendar without guessing a session end time', async () => {
  const stored = __test__.DATA.occurrences.find((item) => item.sourceId === 'verified-outings-citysup-night-nakanoshima-2026');
  const pages = new Map();
  for (const [key, evidence] of Object.entries(stored.fieldEvidence)) {
    if (['dateRange', 'schedule'].includes(key)) continue;
    pages.set(evidence.sourceUrl, `${pages.get(evidence.sourceUrl) ?? ''}<p>${evidence.text}</p>`);
  }
  const result = await __test__.collectCitySupNight({ now: new Date('2026-10-02T12:00:00+09:00'), checkedAt: '2026-10-02T03:00:00Z', fetchText: async (url) => url.includes('/courses/16569/') ? JSON.stringify([
    {date:'2026-10-02',status:'full'}, {date:'2026-10-03',status:'realtime'}, {date:'2026-10-04',status:'realtime'}, {date:'2026-10-20',status:'realtime'},
  ]) : pages.get(url) }, stored);
  assert.equal(result.events[0].venueName, 'β本町橋 桟橋');
  assert.deepEqual(result.events[0].schedule.dates, ['2026-10-03', '2026-10-04']);
  assert.equal(result.events[0].startTime, undefined);
  assert.equal(result.events[0].endTime, undefined);
  assert.match(result.events[0].timeInfo, /17:50/u);
});

test('reviewed attachment stays dated, checks every hash, and withdraws changed or expired text', async () => {
  const url = 'https://official.example.test/attachment.pdf';
  const asset = { url, sha256: 'a'.repeat(64), text: evidenceFixture(), kind: 'pdf', extractionMethod: 'reviewed text extraction', checkedAt: CHECKED_AT };
  const stored = { ...OCCURRENCE, lastCheckedAt: CHECKED_AT, evidenceAssets: [asset], fieldEvidence: {
    ...OCCURRENCE.fieldEvidence,
    description: { ...OCCURRENCE.fieldEvidence.description, sourceUrl: url, sha256: asset.sha256, extractionMethod: asset.extractionMethod, evidenceKind: 'pdf' },
  } };
  const fetchText = async () => evidenceFixture();
  let hashCalls = 0;
  fetchText.assetHash = async () => { hashCalls++; return asset.sha256; };
  const result = await __test__.collectOccurrence({ now: NOW, checkedAt: '2026-09-30T04:00:00Z', fetchText }, stored);
  assert.equal(hashCalls, 1);
  assert.equal(result.allowCachedFallback, false);
  assert.match(result.errors[0], /dated manually reviewed snapshot/u);
  assert.equal(result.events[0].lastCheckedAt, CHECKED_AT);
  assert.equal(result.events[0].fieldEvidence.description.sha256, asset.sha256);
  assert.equal(result.events[0].fieldEvidence.description.extractionMethod, asset.extractionMethod);
  assert.equal(result.events[0].fieldEvidence.description.evidenceKind, 'pdf');
  assert.equal(result.events[0].fieldEvidence.eventName.checkedAt, stored.fieldEvidence.eventName.checkedAt);
  fetchText.assetHash = async () => 'b'.repeat(64);
  const changed = await __test__.collectOccurrence({ now: NOW, fetchText }, stored);
  assert.equal(changed.events.length, 0);
  assert.equal(changed.allowCachedFallback, false);
  const loginBlocked = async () => { throw new Error('primary page blocked'); };
  loginBlocked.assetHash = async () => 'b'.repeat(64);
  const changedBehindLogin = await __test__.collectOccurrence({ now: NOW, fetchText: loginBlocked }, stored);
  assert.equal(changedBehindLogin.events.length, 0);
  assert.equal(changedBehindLogin.allowCachedFallback, false);
  const expired = await __test__.collectOccurrence({ now: new Date('2026-10-14T04:00:00Z'), fetchText }, { ...stored, endDate: '2026-11-01' });
  assert.equal(expired.events.length, 0);
  assert.equal(expired.allowCachedFallback, false);
});

test('official metadata is checked only for evidence explicitly marked as metadata extraction', () => {
  const evidence = {text:'大阪モノレール「万博記念公園」駅徒歩約2分',sourceUrl:OCCURRENCE.officialUrl,checkedAt:CHECKED_AT,extractionMethod:'html-meta-description'};
  const occurrence={...OCCURRENCE,fieldEvidence:{...OCCURRENCE.fieldEvidence,accessByTransit:evidence}};
  const html=`<meta name="description" content="${evidence.text}">${evidenceFixture()}`;
  assert.deepEqual(validateOccurrenceEvidence(new Map([[OCCURRENCE.officialUrl,html]]),occurrence),{valid:true,missing:[]});
  const ordinary={...occurrence,fieldEvidence:{...occurrence.fieldEvidence,accessByTransit:{...evidence,extractionMethod:undefined}}};
  assert.deepEqual(validateOccurrenceEvidence(new Map([[OCCURRENCE.officialUrl,html]]),ordinary),{valid:false,missing:['accessByTransit']});
  const injected=`<script>${html.slice(0,html.indexOf('>')+1)}</script>${evidenceFixture()}`;
  assert.deepEqual(validateOccurrenceEvidence(new Map([[OCCURRENCE.officialUrl,injected]]),occurrence),{valid:false,missing:['accessByTransit']});
});
