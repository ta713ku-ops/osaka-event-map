import assert from 'node:assert/strict';
import test from 'node:test';

import { grandFrontPageCount, parseGrandFrontPage, parseNambaParksPage } from './commercial.mjs';

const CHECKED_AT = '2026-09-19T00:00:00.000Z';

test('parses official Grand Front event dates and excludes external and recruitment cards', () => {
  const html = `
    <a href="/event/5723/" class="card-list-block js-fadeup">
      <img src="/files/festa.jpg"><p class="card-list-block__name">北館１F ナレッジプラザ</p>
      <p class="card-list-block__ttl">健康きづけ場！ついでに健康FESTA</p>
      <time class="start-date" datetime="2026-09-26">2026.09.26</time>
    </a>
    <a href="https://external.example/event" class="card-list-block js-fadeup">
      <p class="card-list-block__ttl">外部会場</p><time datetime="2026-09-26"></time>
    </a>
    <a href="/event/5713/" class="card-list-block js-fadeup">
      <p class="card-list-block__ttl">2028年新卒リクルーティングレセプション</p><time datetime="2026-09-25"></time>
    </a>
    <ul class="pagination"><a href="/event/?page=2">2</a><a href="/event/?page=3">3</a></ul>
  `;
  const events = parseGrandFrontPage(html, { checkedAt: CHECKED_AT });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, '健康きづけ場!ついでに健康FESTA');
  assert.equal(events[0].startDate, '2026-09-26');
  assert.equal(events[0].venueName, 'グランフロント大阪 北館1F ナレッジプラザ');
  assert.equal(events[0].officialUrl, 'https://www.grandfront-osaka.jp/event/5723/');
  assert.equal(grandFrontPageCount(html), 3);
});

test('parses Namba Parks explicit range and excludes member offers', () => {
  const html = `
    <div class="p-event__item" data-category="now" data-start="2026/08/28" data-end="2026/11/01">
      <p class="p-event__item-heading">なんば雲海</p>
      <div class="p-event__item-thumb"><a href="https://nambaparks.com/event/334"><img src="/storage/image.jpg"></a></div>
      <div class="p-event__item-date">2026年8月28日～11月1日</div>
    </div>
    <div class="p-event__item" data-category="now" data-start="2026/09/01" data-end="2027/03/31">
      <p class="p-event__item-heading">プレミアム会員証提示でお得なサービス</p>
      <a href="https://nambaparks.com/event/135"></a>
    </div>
  `;
  const events = parseNambaParksPage(html, { checkedAt: CHECKED_AT });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-08-28');
  assert.equal(events[0].endDate, '2026-11-01');
  assert.equal(events[0].venueName, 'なんばパークス');
  assert.match(events[0].address, /難波中2-10-70/u);
  assert.equal(events[0].officialUrl, 'https://nambaparks.com/event/334');
});
