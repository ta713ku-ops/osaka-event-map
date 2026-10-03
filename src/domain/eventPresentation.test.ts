import {describe,expect,it} from 'vitest';
import {cardPriceLabel,eventFreshness,eventImageIsPortrait,eventMediaKind,eventStatusLabel,isLowResolutionEventImage,normalizeDisplayText,usableEventImage} from './eventPresentation';
import type {EventItem} from '../types';
const now=new Date('2026-09-28T12:00:00+09:00');
const event=(extra:Partial<EventItem>={}):EventItem=>({id:'x',eventName:'展覧会',category:'exhibition',startDate:'2026-09-28',officialUrl:'https://example.test/event',sourceStatus:'success',lastCheckedAt:'2026-09-28T09:00:00+09:00',...extra});
describe('event presentation',()=>{
 it('needs a successful recent source check and rejects future confirmation stamps',()=>{
  expect(eventFreshness(event(),now)).toBe(true);
  for(const extra of [{sourceStatus:'stale' as const},{lastCheckedAt:'2026-09-25T09:00:00+09:00'},{lastCheckedAt:'2026-09-29T09:00:00+09:00'},{lastCheckedAt:'invalid'}])expect(eventFreshness(event(extra),now)).toBe(false);
 });
 it('does not assert today from stale data or open hours from an unverified date range',()=>{
  expect(eventStatusLabel(event({sourceStatus:'stale'}),now)).toBe('掲載日程・最新状況は公式確認');
  expect(eventStatusLabel(event({startDate:'2026-09-01',endDate:'2026-09-30',startTime:'10:00',endTime:'17:00'}),now)).toBe('開催期間中');
  expect(eventStatusLabel(event({startTime:'10:00',endTime:'17:00'}),now)).toBe('開催中');
 });
 it('honors closed dates and explicit cancellation, and labels an overnight event before its start',()=>{
  expect(eventStatusLabel(event({schedule:{closedDates:['2026-09-28'],evidence:'公式'}}),now)).toBe('本日休催');
  expect(eventStatusLabel(event({officialStatus:'cancelled'}),now)).toBe('中止');
  expect(eventStatusLabel(event({startTime:'22:00',endTime:'02:00'}),now)).toBe('本日開催予定');
 });
 it('rejects placeholders and unsafe protocols while accepting an event photograph',()=>{
  for(const imageUrl of ['https://example.test/namba_noimg.jpg','https://example.test/placeholder.png','javascript:alert(1)'])expect(usableEventImage(event({imageUrl}))).toBeUndefined();
  expect(usableEventImage(event({imageUrl:'https://example.test/event.jpg'}))).toBe('https://example.test/event.jpg');
 });
 it('normalizes common named and numeric entities as plain display text',()=>{
  expect(normalizeDisplayText('&yen;1,200&nbsp;&amp;&nbsp;&#x1f363;')).toBe('¥1,200 & 🍣');
  expect(normalizeDisplayText('&lt;画像&gt; &amp;yen;')).toBe('<画像> &yen;');
 });
 it('classifies posters from source clues or portrait dimensions without inventing missing media',()=>{
  expect(eventMediaKind(event())).toBe('none');
  expect(eventMediaKind(event({imageUrl:'https://example.test/event.jpg'}))).toBe('photo');
  expect(eventMediaKind(event({imageUrl:'https://example.test/event.jpg',imageSource:'主催者のポスター'}))).toBe('poster');
  expect(eventMediaKind(event({imageUrl:'https://example.test/NHK_%62anner_01.jpg'}))).toBe('poster');
  expect(eventMediaKind(event({imageUrl:'https://example.test/opening-seminar_flyer_A4.jpg'}))).toBe('poster');
  expect(eventMediaKind(event({imageUrl:'https://example.test/WEB_バナー_920_552.jpg'}))).toBe('poster');
  expect(eventMediaKind(event({imageUrl:'https://example.test/event.jpg'}),{width:600,height:900})).toBe('photo');
  expect(eventImageIsPortrait({width:600,height:900})).toBe(true);
  expect(eventImageIsPortrait({width:1200,height:800})).toBe(false);
  expect(isLowResolutionEventImage({width:420,height:300})).toBe(true);
  expect(isLowResolutionEventImage({width:800,height:1200})).toBe(false);
 });
 it('keeps short prices intact and summarizes long prices with key conditions',()=>{
  expect(cardPriceLabel(event({price:'&yen;1,200（中学生以下無料）'}))).toBe('¥1,200（中学生以下無料）');
  expect(cardPriceLabel(event({price:'一般 1,500円 ※事前予約必須 ※中学生以下無料 ※別途入園料が必要'})))
   .toBe('一般 1,500円・事前予約必須・中学生以下無料・別途入園料が必要・条件は詳細');
  expect(cardPriceLabel(event({price:null,freeEvent:true}))).toBe('無料');
  expect(cardPriceLabel(event({price:'なし'}))).toBeUndefined();
 });
 it('keeps mandatory park admission visible beside the free event price',()=>{
  expect(cardPriceLabel(event({freeEvent:false,price:'催事は無料。別途、自然文化園・日本庭園共通入園料：高校生以上450円、中学生以下無料。'})))
   .toContain('入園料：高校生以上450円');
  expect(cardPriceLabel(event({freeEvent:true,price:'催事は無料。希望者のみ任意のワークショップ参加費500円。中学生以下無料。'})))
   .not.toContain('入園料');
 });
});
