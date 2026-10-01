import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {enrichVenues} from './lib/venues.mjs';

test('facility evidence applies to confirmed rooms and never to a separate activity venue',async()=>{
  const registry=JSON.parse(await readFile(new URL('../data/venue-registry.json',import.meta.url),'utf8'));
  const rows=enrichVenues([
    {venueName:'イオンモール日根野 1Fであいの広場'},
    {venueName:'イオンモール日根野 【集合場所】ジョーシン前\n【実施場所】日根野イオン横公園'},
    {venueName:'イオンモール日根野 未確認の別会場'},
    {venueName:'ビルボードライブ大阪',latitude:34.7,longitude:135.49},
  ],registry);
  assert.equal(rows[0].latitude,34.3931224);
  assert.match(rows[0].accessByTransit,/徒歩約5分/u);
  assert.equal(rows[1].latitude,undefined);
  assert.equal(rows[2].latitude,undefined);
  assert.equal(rows[3].latitude,34.7);
  assert.equal(rows[3].longitude,135.49);
});

test('venue coordinates require a dated source for each axis',()=>{
  const registry=[{aliases:['会場'],fields:{latitude:34.5,longitude:135.5},fieldEvidence:{latitude:{sourceUrl:'https://example.test/access',checkedAt:'2026-09-29T00:00:00Z'}}}];
  const [row]=enrichVenues([{venueName:'会場'}],registry);
  assert.equal(row.latitude,34.5);
  assert.equal(row.longitude,undefined);
});

test('official Namba parking details apply only to the confirmed facility',async()=>{
  const registry=JSON.parse(await readFile(new URL('../data/venue-registry.json',import.meta.url),'utf8'));
  const [parks,other]=enrichVenues([{venueName:'なんばパークス'},{venueName:'別の難波会場'}],registry);
  assert.match(parks.parkingInfo,/平日250円\/30分/u);
  assert.match(parks.accessByCar,/難波中/u);
  assert.equal(parks.fieldEvidence.parkingInfo.sourceUrl,'https://nambaparks.com/access');
  assert.equal(other.parkingInfo,undefined);
});

test('natural history museum access retains the October parking restriction',async()=>{
  const registry=JSON.parse(await readFile(new URL('../data/venue-registry.json',import.meta.url),'utf8'));
  const [exhibition]=enrichVenues([{venueName:'大阪市立自然史博物館 ネイチャーホール'}],registry);
  assert.match(exhibition.accessByTransit,/長居.*800m/u);
  assert.match(exhibition.parkingInfo,/10月4日から利用制限/u);
  assert.equal(exhibition.fieldEvidence.parkingInfo.sourceUrl,'https://omnh.jp/guide_top/guide');
});
