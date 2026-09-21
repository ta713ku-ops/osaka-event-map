import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBillboardPage, __test__ } from './billboard.mjs';

test('Billboard parses explicitly dated official Osaka shows and excludes cancellation or private entries', () => {
  const html = `<div data-trigger-element="schedule-card-list">
    <a class="ArtistCardFull_root__test" href="/osaka/show?event_id=ev-123&amp;date=2026-10-19"><img src="https://www.billboard-live.com/public/event_img/ev-123/top.jpg"><h3 class="EventHeading_mainTitle__test" aria-label="公式ライブ"></h3></a>
    <a class="ArtistCardFull_root__test" href="/osaka/show?event_id=ev-124&amp;date=2026-10-20"><h3 class="EventHeading_mainTitle__test" aria-label="公演中止のお知らせ"></h3></a>
    <a class="ArtistCardFull_root__test" href="/osaka/show?event_id=ev-125&amp;date=2026-10-21">Private</a>
  </div>`;
  const events = parseBillboardPage(html, { checkedAt: '2026-09-19T00:00:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, '公式ライブ');
  assert.equal(events[0].startDate, '2026-10-19');
  assert.match(events[0].address, /ハービスPLAZA ENT B2/u);
  assert.equal(events[0].officialUrl, 'https://www.billboard-live.com/osaka/show?event_id=ev-123&date=2026-10-19');
  assert.deepEqual(__test__.monthsFrom('2026-12-31T16:00:00Z', 2), ['202701', '202702']);
});
