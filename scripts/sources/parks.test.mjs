import assert from 'node:assert/strict';
import test from 'node:test';

import { __test__, PARK_SOURCE_DEFINITIONS } from './parks.mjs';

const CHECKED = '2026-09-17T00:00:00.000Z';

test('parses Expo Park ranges and discrete sports dates without inventing a continuous range', () => {
  const html = `
    <div class="module__park-and-sport-new-event">
      <section class="event-box"><ul><li>
        <p class="left"><a href="https://www.expo70-park.jp/event/1/"><img src="/image/event.jpg" alt=""></a></p>
        <div class="right"><p class="date">2026年9月19日(土曜日)から<br>2026年9月23日(水曜日)</p>
        <h1><a href="https://www.expo70-park.jp/event/1/">秋の公園イベント</a></h1></div>
      </li></ul></section>
      <section class="sport-box"><ul><li>
        <p class="date">2026年10月04日(日曜日)<br>2026年10月25日(日曜日)</p>
        <h1><a href="/event/2/">スポーツ教室</a></h1>
      </li></ul></section>
    </div><!-- CSS -->`;
  const events = __test__.parseExpoParkPage(html, { checkedAt: CHECKED, source: PARK_SOURCE_DEFINITIONS[0] });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => [event.eventName, event.startDate, event.endDate]), [
    ['秋の公園イベント', '2026-09-19', '2026-09-23'],
    ['スポーツ教室', '2026-10-04', '2026-10-04'],
    ['スポーツ教室', '2026-10-25', '2026-10-25'],
  ]);
  assert.ok(events.every((event) => event.venueName === '万博記念公園'));
  assert.ok(events.every((event) => event.fieldEvidence?.date?.sourceUrl === PARK_SOURCE_DEFINITIONS[0].url));
});

test('parses Hirakata Park official listing dates, images and explicit closure dates', () => {
  const html = `
    <section class="topics__event" data-section-tab="event">
      <div class="event__main-block"><a class="event__main-link" href="https://example.test/main">
        <article><img data-src="/main.jpg" alt=""><h3 class="event__main-title">大型展示イベント</h3>
        <div class="event__main-date"><span>2026年07月18日(土)〜2026年09月27日(日)</span></div>
        <span data-startday="20260718" data-endday="20260927" data-holiday="20260917,20260924"></span></article>
      </a></div>
      <article class="event__article-list"><a class="event__link" href="/topics/second/">
        <article><img src="/second.jpg" alt=""><h4 class="event__title">親子イベント</h4>
        <div class="event__main-date"><span>2026年10月03日(土)〜2026年10月04日(日)</span></div>
        <span data-startday="20261003" data-endday="20261004" data-holiday=""></span></article>
      </a></article>
    </section>
    <section class="topics__pickup"></section>`;
  const events = __test__.parseHirakataParkPage(html, { checkedAt: CHECKED, source: PARK_SOURCE_DEFINITIONS[1] });
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].schedule?.closedDates, ['2026-09-17', '2026-09-24']);
  assert.equal(events[0].imageUrl, 'https://www.hirakatapark.co.jp/main.jpg');
  assert.equal(events[1].officialUrl, 'https://www.hirakatapark.co.jp/topics/second/');
  assert.ok(events.every((event) => event.venueName === 'ひらかたパーク'));
  assert.ok(events.every((event) => event.address.includes('大阪府枚方市')));
});

test('rejects unrecognized date attributes instead of guessing dates', () => {
  const html = '<section class="topics__event"><a class="event__link" href="/x"><h4 class="event__title">日付不明</h4><span data-startday="soon" data-endday="later"></span></a></section><section class="topics__pickup"></section>';
  assert.deepEqual(__test__.parseHirakataParkPage(html, { checkedAt: CHECKED, source: PARK_SOURCE_DEFINITIONS[1] }), []);
});
