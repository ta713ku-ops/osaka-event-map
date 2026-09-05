import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADDITIONAL_SOURCE_DEFINITIONS,
  SOURCE_URLS,
  __test__,
  collectAdditionalEvents,
} from './index.mjs';

const NOW = new Date('2026-09-04T12:00:00+09:00');
const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const GHIBLI_FIXTURE = `<h1>開催概要</h1><div class="mv-date">2026年7月18日～9月26日</div><div class="mv-venue">大阪南港ATCギャラリー 〒559-0034 大阪市住之江区南港北2-1-10</div><ul><li><h3>展覧会名</h3><p>ジブリパーク展</p></li><li><h3>会期</h3><p>2026年7月18日～9月26日</p></li><li><h3>会場</h3><p>大阪南港ATCギャラリー 〒559-0034 大阪市住之江区南港北2-1-10</p></li></ul>`;
const ATC_FIXTURE = `<script>const atcEventList = {"preload":[{"title":"ATCテストイベント","url":"/event/test/","location":"ATCホール","date_ymd":"2026-09-20","end_ymd":"2026-09-20"}]};</script>`;

function source(id, url) {
  return { id, name: id, url };
}

function context(id, url, now = NOW) {
  return { now, checkedAt: now.toISOString(), source: source(id, url) };
}

async function fixture(name) {
  return readFile(join(FIXTURE_ROOT, name), 'utf8');
}

function assertOfficialLinks(events) {
  assert.ok(events.length > 0);
  for (const event of events) {
    assert.match(event.officialUrl, /^https:\/\//);
    assert.doesNotMatch(event.officialUrl, /(?:href|src)\s*=/i);
    assert.equal(event.sourceId !== undefined, true);
  }
}

test('date and time parsers preserve cross-year ranges and reject ambiguous text', () => {
  assert.deepEqual(__test__.parseDateRange('9月6日（日）～12日（土）', 2026), {
    startDate: '2026-09-06',
    endDate: '2026-09-12',
    sourceDateText: '9月6日（日）～12日（土）',
  });
  assert.deepEqual(__test__.parseDateRange('12月30日～1月3日', 2026), {
    startDate: '2026-12-30',
    endDate: '2027-01-03',
    sourceDateText: '12月30日～1月3日',
  });
  assert.equal(__test__.parseDateRange('9月4日・6日', 2026), undefined);
  assert.deepEqual(__test__.dateTokens('11月14日、15日', 2026).map((token) => token.date), ['2026-11-14', '2026-11-15']);
  assert.deepEqual(
    __test__.parseNaturalHistoryDates('■日時：2026年9月4日・6日 10:00～16:00', 2026).map((range) => [range.startDate, range.endDate]),
    [['2026-09-04', '2026-09-04'], ['2026-09-06', '2026-09-06']],
  );
  assert.equal(__test__.parseTimeRange('2026-09-04'), undefined);
  assert.equal(__test__.parseTimeRange('9-10'), undefined);
  assert.deepEqual(__test__.parseTimeRange('10：00〜19：00'), {
    startTime: '10:00',
    endTime: '19:00',
    sourceTimeText: '10：00〜19：00',
  });
  assert.equal(__test__.categoryFor('日本絵画展'), 'exhibition');
  assert.equal(__test__.categoryFor('陶芸家の作陶展'), 'exhibition');
  assert.equal(__test__.categoryFor('室内楽コンサート'), 'music');
  assert.equal(__test__.categoryFor('落語公演'), 'theater');
});

test('official HTML adapters parse current records with source URLs and verified fixed venues', async () => {
  const city = __test__.parseOsakaCityPage(await fixture('osaka-city-events.html'), context('city', SOURCE_URLS.osakaCity));
  assert.equal(city.length, 4);
  assert.equal(city.find((event) => event.eventName.includes('大阪クラシック'))?.startDate, '2026-09-06');
  assertOfficialLinks(city);

  const info = __test__.parseOsakaInfoPage(await fixture('osaka-info-events.html'), context('info', SOURCE_URLS.osakaInfo));
  assert.equal(info.length, 3);
  assert.equal(info.find((event) => event.eventName === 'ウィークエンドマーケット')?.venueName, '服部緑地');
  assert.equal(info.find((event) => event.eventName === '秋の自然観察会')?.price, '無料');
  assert.equal('freeEvent' in info.find((event) => event.eventName === '秋の自然観察会'), false);
  assertOfficialLinks(info);

  const art = __test__.parseOsakaArtMuseumPage(await fixture('osaka-art-museum.html'), context('art', SOURCE_URLS.osakaArtMuseum));
  assert.equal(art.length, 5);
  assert.equal(art[0].venueName, '大阪市立美術館');
  assert.equal(art[0].address, '大阪府大阪市天王寺区茶臼山町1-82（天王寺公園内）');
  assert.equal('latitude' in art[0], false);
  assertOfficialLinks(art);

  const nakka = __test__.parseNakkaMuseumPage(await fixture('nakka-art-museum.html'), context('nakka', SOURCE_URLS.nakkaMuseum));
  assert.equal(nakka.length, 4);
  assert.equal(nakka.find((event) => event.eventName.includes('大英博物館'))?.endDate, '2027-01-31');
  assertOfficialLinks(nakka);

  const hall = __test__.parseFestivalHallPage(await fixture('festival-hall.html'), context('hall', SOURCE_URLS.festivalHall));
  assert.equal(hall.length, 1);
  assert.equal(hall[0].category, 'music');
  assert.equal(hall[0].officialUrl, 'https://www.festivalhall.jp/events/6379/');
  assert.equal(hall[0].startTime, '19:15');
  assertOfficialLinks(hall);

  const hankyu = __test__.parseHankyuPage(await fixture('hankyu-umeda.html'), context('hankyu', SOURCE_URLS.hankyuUmeda));
  assert.equal(hankyu.length, 3);
  assert.equal(hankyu.find((event) => event.eventName === '秋の北海道物産大会')?.endDate, '2026-10-05');
  for (const event of hankyu) {
    assert.match(event.venueName, /^阪急うめだ本店 /);
    assert.doesNotMatch(event.venueName, /◎|9月\d+日|10月\d+日/);
  }
  assertOfficialLinks(hankyu);

  const museumContext = context('osaka-natural-history-museum', SOURCE_URLS.naturalHistoryMuseum);
  const museumHome = __test__.parseNaturalHistoryPage(await fixture('omnh-home.html'), museumContext);
  assert.equal(museumHome.recognized, true);
  assert.equal(museumHome.links.length, 2);
  const museumEvent = __test__.parseNaturalHistoryDetailPage(await fixture('omnh-event-14221.html'), {
    ...museumContext,
    officialUrl: 'https://omnh.jp/archives/14221',
  });
  assert.equal(museumEvent.length, 1);
  assert.equal(museumEvent[0].startDate, '2026-09-12');
  assert.equal(museumEvent[0].venueName, '大阪市立自然史博物館 本館（受付：ナウマンホール）');
  assert.equal(museumEvent[0].address, '〒546-0034 大阪市東住吉区長居公園1-23');
  assert.deepEqual([museumEvent[0].startTime, museumEvent[0].endTime], ['10:00', '16:30']);
  assert.equal(museumEvent[0].tagEvidence?.free, '無料');
  assertOfficialLinks(museumEvent);

  const festivalEvent = __test__.parseNaturalHistoryDetailPage(await fixture('omnh-event-14237.html'), {
    ...museumContext,
    officialUrl: 'https://omnh.jp/archives/14237',
  });
  assert.deepEqual(festivalEvent.map((event) => event.startDate), ['2026-11-14', '2026-11-15']);
  assert.ok(festivalEvent.every((event) => event.venueName.includes('大阪市立自然史博物館')));
  assert.ok(festivalEvent.every((event) => event.address === '〒546-0034 大阪市東住吉区長居公園1-23'));
  assertOfficialLinks(festivalEvent);

  const offsiteMuseumEvent = __test__.parseNaturalHistoryDetailPage(
    '<article><h1 class="entry-title">館外観察会</h1><div class="entry-body"><p>■日時：2026年9月12日（土）</p><p>■場所：京都府木津川市</p></div><div class="entry-footer"></div></article>',
    { ...museumContext, officialUrl: 'https://omnh.jp/archives/offsite' },
  );
  assert.deepEqual(offsiteMuseumEvent, []);

  const spacedLabelMuseumEvent = __test__.parseNaturalHistoryDetailPage(
    '<article><h1 class="entry-title">触れる鑑賞シンポジウム</h1><div class="entry-body"><p>■日　時：2026年9月23日（水）13:00～16:00</p><p>■対面会場：大阪市立自然史博物館 講堂</p><p>■参 加 費 ：無料</p></div><div class="entry-footer"></div></article>',
    { ...museumContext, officialUrl: 'https://omnh.jp/archives/spaced-label' },
  );
  assert.equal(spacedLabelMuseumEvent.length, 1);
  assert.deepEqual([spacedLabelMuseumEvent[0].startDate, spacedLabelMuseumEvent[0].venueName], ['2026-09-23', '大阪市立自然史博物館 講堂']);
  assert.equal(spacedLabelMuseumEvent[0].tagEvidence?.free, '無料');

  const zepp = __test__.parseZeppNambaPage(await fixture('zepp-namba.html'), context('zepp-namba', SOURCE_URLS.zeppNamba));
  assert.equal(zepp.length, 2);
  assert.equal(zepp.find((event) => event.eventName === 'Zepp de LIVE')?.venueName, 'Zepp Namba (OSAKA)');
  assert.equal(zepp.find((event) => event.eventName === 'Zepp de LIVE')?.startDate, '2026-09-05');
  assert.equal(zepp.find((event) => event.eventName === 'Zepp de LIVE')?.startTime, '11:30');
  assert.equal('endTime' in zepp.find((event) => event.eventName === 'Zepp de LIVE'), false);
  assert.ok(zepp.every((event) => !('endTime' in event)));
  assert.match(zepp.find((event) => event.eventName === 'Zepp de LIVE')?.evidence?.time ?? '', /OPEN.*11:00/);
  assertOfficialLinks(zepp);

  const dainichi = __test__.parseAeonIndex(JSON.parse(await fixture('aeon-dainichi.json')), {
    ...context('aeon-dainichi', SOURCE_URLS.aeonDainichi),
    source: { ...source('aeon-dainichi', SOURCE_URLS.aeonDainichi), venueName: 'イオンモール大日', address: '大阪府守口市大日東町1-18' },
  });
  assert.equal(dainichi.length, 2);
  assert.equal(dainichi[0].venueName, 'イオンモール大日');
  assert.equal(dainichi[0].address, '大阪府守口市大日東町1-18');
  assertOfficialLinks(dainichi);

  const hineno = __test__.parseAeonIndex(JSON.parse(await fixture('aeon-hineno.json')), {
    ...context('aeon-hineno', SOURCE_URLS.aeonHineno),
    source: { ...source('aeon-hineno', SOURCE_URLS.aeonHineno), venueName: 'イオンモール日根野', address: '大阪府泉佐野市日根野2496-1' },
  });
  assert.equal(hineno.length, 2);
  assert.equal(hineno[1].address, '大阪府泉佐野市日根野2496-1');
  assertOfficialLinks(hineno);

  const ibaraki = __test__.parseAeonIndex(JSON.parse(await fixture('aeon-ibaraki.json')), {
    ...context('aeon-ibaraki', SOURCE_URLS.aeonIbaraki),
    source: { ...source('aeon-ibaraki', SOURCE_URLS.aeonIbaraki), venueName: 'イオンモール茨木', address: '大阪府茨木市松ケ本町8-30' },
  });
  assert.equal(ibaraki.length, 3);
  assert.equal(ibaraki[0].venueName, 'イオンモール茨木');
  assert.equal(ibaraki[0].address, '大阪府茨木市松ケ本町8-30');
  assertOfficialLinks(ibaraki);
});

test('Aeon adapter uses explicit event dates, never CMS publication dates, and splits schedules', async () => {
  const parsed = JSON.parse(await fixture('aeon-osaka-dome-city.json'));
  const events = __test__.parseAeonIndex(parsed, context('aeon', SOURCE_URLS.aeonOsakaDomeCity));
  assert.equal(events.length, 3);
  const pokemon = events.find((event) => event.eventName.includes('ポケモン'));
  assert.deepEqual([pokemon.startDate, pokemon.endDate], ['2026-09-04', '2026-09-27']);
  assert.notEqual(pokemon.startDate, '2026-08-26');
  assert.equal(events.find((event) => event.eventName.includes('親子'))?.description, '親子で参加できる無料イベントです。');
  assert.equal('freeEvent' in events.find((event) => event.eventName.includes('親子')), false);
  assertOfficialLinks(events);

  const discrete = __test__.parseAeonIndex({
    events: [{
      is_published: true,
      html_path: '/sc/osakadomecity/event/discrete.html',
      title: '構造化された離散開催',
      event_calendar_schedules: [
        { calendar_start_date: '2026-09-10', calendar_end_date: '2026-09-10' },
        { calendar_start_date: '2026-09-17', calendar_end_date: '2026-09-17' },
      ],
    }],
  }, context('aeon', SOURCE_URLS.aeonOsakaDomeCity));
  assert.deepEqual(discrete.map((event) => event.startDate), ['2026-09-10', '2026-09-17']);
  assert.deepEqual(discrete.map((event) => event.endDate), ['2026-09-10', '2026-09-17']);
});

test('collectAdditionalEvents returns the contract and visits every declared OSAKA-INFO page', async () => {
  const fixtureByUrl = new Map([
    [SOURCE_URLS.osakaCity, await fixture('osaka-city-events.html')],
    [SOURCE_URLS.osakaArtMuseum, await fixture('osaka-art-museum.html')],
    [SOURCE_URLS.nakkaMuseum, await fixture('nakka-art-museum.html')],
    [SOURCE_URLS.festivalHall, await fixture('festival-hall.html')],
    [SOURCE_URLS.hankyuUmeda, await fixture('hankyu-umeda.html')],
    [SOURCE_URLS.osakaInfo, await fixture('osaka-info-events.html')],
    [SOURCE_URLS.aeonDainichi, await fixture('aeon-dainichi.json')],
    [SOURCE_URLS.aeonHineno, await fixture('aeon-hineno.json')],
    [SOURCE_URLS.aeonIbaraki, await fixture('aeon-ibaraki.json')],
    [SOURCE_URLS.naturalHistoryMuseum, await fixture('omnh-home.html')],
    ['https://omnh.jp/archives/14221', await fixture('omnh-event-14221.html')],
    ['https://omnh.jp/archives/14237', await fixture('omnh-event-14237.html')],
    [SOURCE_URLS.zeppNamba, await fixture('zepp-namba.html')],
    [SOURCE_URLS.ghibliParkOsaka, GHIBLI_FIXTURE],
    [SOURCE_URLS.atcEvents, ATC_FIXTURE],
  ]);
  const aeonJson = await fixture('aeon-osaka-dome-city.json');
  const aeonByIndexUrl = new Map([
    ['https://www.aeon.jp/sc/osakadomecity/event/index.json', aeonJson],
    ['https://www.aeon.jp/sc/dainichi/event/index.json', fixtureByUrl.get(SOURCE_URLS.aeonDainichi)],
    ['https://www.aeon.jp/sc/hineno/event/index.json', fixtureByUrl.get(SOURCE_URLS.aeonHineno)],
    ['https://www.aeon.jp/sc/ibaraki/event/index.json', fixtureByUrl.get(SOURCE_URLS.aeonIbaraki)],
  ]);
  const infoPages = [];
  const fetchText = async (url) => {
    if (url.startsWith('https://osaka-info.jp/api_/orden/get_event_list.php')) {
      infoPages.push(url);
      const page = new URL(url).searchParams.get('page');
      // Make the fixture declare six distinct pages so a regression to the
      // old Math.min(5, ...) cap is observable without network access.
      if (page !== '1') return fixtureByUrl.get(SOURCE_URLS.osakaInfo).replace(/label=osaka/g, `label=osaka-page-${page}`).replace('1 ページ中 1 ページ目', `${page} ページ中 ${page} ページ目`);
      return fixtureByUrl.get(SOURCE_URLS.osakaInfo).replace('1 ページ中 1 ページ目', '6 ページ中 1 ページ目');
    }
    if (aeonByIndexUrl.has(url)) return aeonByIndexUrl.get(url);
    const value = fixtureByUrl.get(url);
    if (value === undefined) throw new Error(`unexpected URL: ${url}`);
    return value;
  };

  const result = await collectAdditionalEvents({ fetchText, now: NOW });
  assert.equal(result.sources.length, ADDITIONAL_SOURCE_DEFINITIONS.length);
  assert.equal(result.sources.length, 14);
  assert.deepEqual([...new Set(result.sources.map((item) => item.status))], ['success']);
  assert.ok(result.events.length > 0);
  assert.ok(result.events.some((event) => event.sourceId === 'osaka-art-museum'));
  assert.ok(result.events.some((event) => event.sourceId === 'aeon-osaka-dome-city'));
  assert.ok(result.events.some((event) => event.sourceId === 'osaka-natural-history-museum'));
  assert.ok(result.events.some((event) => event.sourceId === 'zepp-namba'));
  assert.equal(infoPages.length, 6);
  for (const report of result.sources) {
    assert.match(report.url, /^https:\/\//);
    assert.equal(report.checkedAt, NOW.toISOString());
    assert.equal(['success', 'error', 'stale'].includes(report.status), true);
    assert.equal('partial' in report, false);
  }
});

test('source failures and changed markup are reported as error rather than successful zero', async () => {
  const failed = await collectAdditionalEvents({
    fetchText: async () => { throw new Error('network unavailable'); },
    now: NOW,
  });
  assert.equal(failed.events.length, 0);
  assert.equal(failed.sources.length, 14);
  assert.ok(failed.sources.every((sourceReport) => sourceReport.status === 'error'));
  assert.ok(failed.sources.every((sourceReport) => /network unavailable/.test(sourceReport.error ?? '')));

  const changed = await collectAdditionalEvents({
    fetchText: async () => '<html><body>provider markup changed</body></html>',
    now: NOW,
  });
  assert.equal(changed.events.length, 0);
  assert.ok(changed.sources.every((sourceReport) => sourceReport.status === 'error'));
  assert.ok(changed.sources.every((sourceReport) => sourceReport.error));
});

test('repeated OSAKA-INFO pagination is reported as stale partial retrieval', async () => {
  const info = await fixture('osaka-info-events.html');
  const infoPages = [];
  const fetchText = async (url) => {
    if (url.startsWith('https://osaka-info.jp/api_/orden/get_event_list.php')) {
      infoPages.push(url);
      return info.replace('1 ページ中 1 ページ目', '3 ページ中 1 ページ目');
    }
    if (url === 'https://www.aeon.jp/sc/osakadomecity/event/index.json') return fixture('aeon-osaka-dome-city.json');
    const files = {
      [SOURCE_URLS.osakaCity]: 'osaka-city-events.html',
      [SOURCE_URLS.osakaArtMuseum]: 'osaka-art-museum.html',
      [SOURCE_URLS.nakkaMuseum]: 'nakka-art-museum.html',
      [SOURCE_URLS.festivalHall]: 'festival-hall.html',
      [SOURCE_URLS.hankyuUmeda]: 'hankyu-umeda.html',
      [SOURCE_URLS.naturalHistoryMuseum]: 'omnh-home.html',
      ['https://omnh.jp/archives/14221']: 'omnh-event-14221.html',
      ['https://omnh.jp/archives/14237']: 'omnh-event-14237.html',
      [SOURCE_URLS.zeppNamba]: 'zepp-namba.html',
    };
    if (files[url]) return fixture(files[url]);
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await collectAdditionalEvents({ fetchText, now: NOW });
  const report = result.sources.find((item) => item.id === 'osaka-info-events');
  assert.equal(infoPages.length, 2);
  assert.equal(report?.status, 'stale');
  assert.match(report?.error ?? '', /repeated response/);
  assert.ok((report?.count ?? 0) > 0);
});
