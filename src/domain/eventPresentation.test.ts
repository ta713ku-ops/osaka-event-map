import {describe,expect,it} from 'vitest';
import {eventFreshness,eventStatusLabel,usableEventImage} from './eventPresentation';
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
});
