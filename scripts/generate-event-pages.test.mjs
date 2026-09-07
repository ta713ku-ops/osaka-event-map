import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, eventPageHtml } from './generate-event-pages.mjs';

test('escapes metadata and emits canonical structured event data', () => {
  const template = '<html><head><meta name="description" content="old" /><title>old</title></head><body></body></html>';
  const html = eventPageHtml(template, {
    id: 'event-a', eventName: '大阪 & 夏祭り', description: '<楽しい>', startDate: '2026-09-06',
    venueName: '中之島', officialUrl: 'https://example.test/event', imageUrl: 'https://example.test/image.jpg',
  }, 'https://example.test/osaka-event-map/');
  assert.match(html, /<title>大阪 &amp; 夏祭り｜どこいこ大阪<\/title>/u);
  assert.match(html, /rel="canonical" href="https:\/\/example\.test\/osaka-event-map\/events\/event-a\/"/u);
  assert.match(html, /application\/ld\+json/u);
  assert.doesNotMatch(html, /<楽しい>/u);
});

test('escapes XML and HTML-significant characters', () => {
  assert.equal(escapeHtml(`a&<>'"`), 'a&amp;&lt;&gt;&#39;&quot;');
});
