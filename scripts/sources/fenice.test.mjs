import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFenicePage } from './fenice.mjs';

test('Fenice uses performance dates, not published dates, and requires an on-site room', () => {
  const html = `<time datetime="2026.09.18">2026.09.18</time>
    <li class="p-event__item"><div class="c-event_card"><a href="https://www.fenice-sacay.jp/event/123/"><img src="https://www.fenice-sacay.jp/wp/wp-content/uploads/2026/09/poster.jpg"><div class="c-pickup__title">秋の音楽会</div><li class="c-pickup__info__item">2026.10.24(土) 14:00開演</li><li class="c-pickup__info__item"><i><img src="/img/common/ico/location-dot-light.svg"></i>大ホール</li></a></div></li>
    <li class="p-event__item"><div class="c-event_card"><a href="https://www.fenice-sacay.jp/event/124/"><div class="c-pickup__title">館外イベント</div><li class="c-pickup__info__item">2026.10.25</li><li class="c-pickup__info__item"><i><img src="/img/common/ico/location-dot-light.svg"></i>別会場</li></a></div></li>`;
  const events = parseFenicePage(html, { checkedAt: '2026-09-20T00:00:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-10-24');
  assert.equal(events[0].venueName, 'フェニーチェ堺 大ホール');
  assert.equal(events[0].officialUrl, 'https://www.fenice-sacay.jp/event/123/');
});
