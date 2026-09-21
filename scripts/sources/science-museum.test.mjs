import assert from 'node:assert/strict';
import test from 'node:test';

import { parseScienceMuseumPage } from './science-museum.mjs';

test('science museum accepts explicit event years and ignores commented or yearless dates', () => {
  const html = `<!-- <div id="pl1"><h3>古い催し</h3><table><tr><th>日時</th><td>2026年9月1日</td></tr></table></div> -->
    <div id="pl2"><h3 class="tit03">探究ラボ</h3><img src="https://www.sci-museum.jp/wp-content/uploads/2026/lab.jpg"><table><tr><th>日時</th><td>2026年10月4日（日） 10:30～12:00</td></tr></table></div>
    <div id="pl3"><h3 class="tit03">年なし催し</h3><table><tr><th>日時</th><td>11月1日 10:00～</td></tr></table></div>
    <div id="pl4"><h3 class="tit03">終了年だけ明記した企画展</h3><table><tr><th>日時</th><td>11月7日～2027年1月17日</td></tr></table></div>`;
  const events = parseScienceMuseumPage(html, { checkedAt: '2026-09-21T00:00:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-10-04');
  assert.equal(events[0].startTime, '10:30');
  assert.equal(events[0].officialUrl, 'https://www.sci-museum.jp/event/#pl2');
  assert.match(events[0].address, /中之島4-2-1/u);
});
