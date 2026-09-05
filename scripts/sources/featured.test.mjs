import assert from 'node:assert/strict';
import test from 'node:test';

import { __test__, FEATURED_SOURCE_DEFINITIONS } from './featured.mjs';

const NOW = new Date('2026-09-05T00:00:00+09:00');
const CHECKED = NOW.toISOString();

const ghibliHtml = `
<html><head><title>ジブリパーク展｜大阪会場</title></head><body>
<h1>開催概要</h1><div class="mv-date">2026年7月18日（土）～9月26日（土）</div>
<div class="mv-venue">大阪南港ＡＴＣギャラリー<br>〒559-0034 大阪市住之江区南港北2-1-10</div>
<ul><li><h3>展覧会名</h3><p>ジブリパーク展</p></li>
<li><h3>会期</h3><p>2026年7月18日（土）～9月26日（土）</p></li>
<li><h3>会場</h3><p>大阪南港ＡＴＣギャラリー<br>〒559-0034 大阪市住之江区南港北2-1-10</p></li>
<li><h3>開場時間</h3><p>9:00～19:00（最終入場18:30）※9月26日は17:00まで（最終入場16:30）</p></li></ul>
<div class="intro-text">ジブリパークの世界を紹介する展覧会です。</div>
<img src="/osaka/img/img_mv.jpg" alt="ジブリパーク展"></body></html>`;

test('Ghibli Osaka parser requires explicit official venue and preserves final-day exception', () => {
  const events = __test__.parseGhibliParkPage(ghibliHtml, { now: NOW, checkedAt: CHECKED, source: FEATURED_SOURCE_DEFINITIONS[0] });
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].startDate, events[0].endDate], ['2026-07-18', '2026-09-26']);
  assert.equal(events[0].venueName, '大阪南港ATCギャラリー');
  assert.equal(events[0].startTime, '09:00');
  assert.equal('endTime' in events[0], false);
  assert.match(events[0].description, /最終日9月26日は17:00/);
  assert.deepEqual(__test__.parseGhibliParkPage(ghibliHtml.replace(/大阪南港ＡＴＣギャラリー/g, '会場調整中'), { now: NOW, checkedAt: CHECKED }), []);
});

test('ATC parser consumes public preload data and does not invent a venue', () => {
  const html = `<script>const atcEventList = {"preload":[
    {"title":"ジブリパーク展","url":"/event/ghibli/","location":"大阪南港ATCギャラリー","date_ymd":"2026-07-18","end_ymd":"2026-09-26","date_text":"7月18日～9月26日","time_text":"9:00～19:00"},
    {"title":"海辺のライブ","url":"/event/live/","location":"海辺のステージ","date_ymd":"2026-09-20","end_ymd":"2026-09-20"}
  ]};</script>`;
  const events = __test__.parseAtcEventsPage(html, { now: NOW, checkedAt: CHECKED, source: FEATURED_SOURCE_DEFINITIONS[1] });
  assert.equal(events.length, 2);
  assert.equal(events[0].venueName, '大阪南港ATCギャラリー');
  assert.equal(events[1].venueName, '海辺のステージ');
});
