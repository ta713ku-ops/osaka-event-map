import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLucuaDetail, parseLucuaLinks } from './lucua.mjs';

const CHECKED_AT = '2026-09-19T00:00:00.000Z';

test('collects only official article links from the Lucua archive', () => {
  const html = '<article class="topics-archive-post"><a href="https://www.lucua.jp/topics/p-123.html">A</a></article><article class="topics-archive-post"><a href="https://other.example/topics/p-9.html">B</a></article>';
  assert.deepEqual(parseLucuaLinks(html), ['https://www.lucua.jp/topics/p-123.html']);
});

test('requires explicit event year instead of publication or image year', () => {
  const base = '<meta property="og:image" content="http://lucua.jp/wp-content/uploads/2026/08/image.jpg"><h1 class="entry-title">ルクアテスト</h1>';
  const noEventYear = `${base}<time datetime="2026-09-11">公開日</time><div class="event-date"><p class="date">9/18</p></div>`;
  assert.equal(parseLucuaDetail(noEventYear, { officialUrl: 'https://www.lucua.jp/topics/p-123.html', checkedAt: CHECKED_AT }), undefined);
  const withEventYear = `${base}<div class="event-date"><p class="date"><span class="year">2026/</span>9/18</p><p class="date"><span class="year">2026/</span>9/23</p></div>`;
  const event = parseLucuaDetail(withEventYear, { officialUrl: 'https://www.lucua.jp/topics/p-123.html', checkedAt: CHECKED_AT });
  assert.equal(event.startDate, '2026-09-18');
  assert.equal(event.endDate, '2026-09-23');
  assert.equal(event.imageUrl, 'https://lucua.jp/wp-content/uploads/2026/08/image.jpg');
});
