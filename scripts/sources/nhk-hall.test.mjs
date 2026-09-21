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
