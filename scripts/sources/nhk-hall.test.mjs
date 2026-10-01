import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNhkHallPage } from './nhk-hall.mjs';

test('NHK hall uses month heading and event day, not inconsistent timer metadata', () => {
  const html = `<h2 class="eventh2">2026年10月</h2><tr class="event_timer" event_date="20261005"><td class="td_eventDT"><p><strong>３</strong>(土)<br>開場 １７：００<br>開演 １８：３０</p></td><td><p class="fxl"><strong>大阪の公演</strong></p></td></tr>
  <tr class="event_timer"><td class="td_eventDT"><p><strong>４</strong></p></td><td rowspan="2"><p class="fxl"><strong>中止のお知らせ</strong></p></td></tr>`;
  const events = parseNhkHallPage(html, { checkedAt: '2026-09-20T00:00:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-10-03');
  assert.equal(events[0].startTime, '18:30');
  assert.equal(events[0].officialUrl, 'https://www.nhk-osakahall.jp/event/');
});

test('NHK hall keeps official registration closure and planned ending with row-level evidence', () => {
  const html = `<h2 class="eventh2">2026年10月</h2>
    <tr class="event_timer"><td class="td_eventDT"><p><strong>１</strong>(木)<br>開場 １７：３５<br>開演 １８：２０<br>終演予定 20：40</p></td><td><p class="fxl"><strong>第460回ＮＨＫ上方落語の会</strong></p></td><td><p>申込み受付は終了しました。</p></td></tr>
    <tr class="event_timer"><td class="td_eventDT"><p><strong>２</strong>(金)<br>開演 １８：３０</p></td><td><p class="fxl"><strong>別の公演</strong></p></td><td><p>お問い合わせください。</p></td></tr>`;
  const events = parseNhkHallPage(html, { checkedAt: '2026-10-01T00:00:00Z' });
  assert.equal(events.length, 2);
  assert.equal(events[0].endTime, '20:40');
  assert.equal(events[0].officialStatus, 'registration_closed');
  assert.equal(events[0].reservationRequired, true);
  assert.match(events[0].reservationInfo, /受付は終了/u);
  assert.match(events[0].fieldEvidence.reservation.text, /受付は終了/u);
  assert.equal(events[1].officialStatus, undefined);
});
