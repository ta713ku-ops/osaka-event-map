import {act,renderHook,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useBookmarks} from './useBookmarks';
import {BOOKMARKS_KEY} from '../domain/bookmarks';
import type {EventItem} from '../types';
const event:EventItem={id:'changing-id',routeId:'stable-route',eventName:'保存する催し',category:'art',startDate:'2026-10-01'};
let storage: Pick<Storage,'getItem'|'setItem'|'removeItem'|'clear'>;
beforeEach(()=>{ const values=new Map<string,string>();storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},clear:()=>values.clear()};vi.stubGlobal('localStorage',storage); });
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('saved event persistence',()=>{
 it('restores a saved snapshot even when the feed no longer contains the event',()=>{
  const a=renderHook(useBookmarks);act(()=>a.result.current.toggle(event));a.unmount();
  const b=renderHook(useBookmarks);expect(b.result.current.items[0]).toMatchObject({routeId:'stable-route',eventName:'保存する催し'});act(()=>b.result.current.remove('stable-route'));expect(b.result.current.items).toHaveLength(0);
 });
 it('shows a write failure without claiming the event has been saved',()=>{
  const a=renderHook(useBookmarks);vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});act(()=>a.result.current.toggle(event));expect(a.result.current.items).toHaveLength(0);expect(a.result.current.notice).toMatch(/保存できません/);
 });
 it('can recover after corrupt storage and synchronizes removal from another tab',()=>{
  localStorage.setItem(BOOKMARKS_KEY,'{invalid');const a=renderHook(useBookmarks);expect(a.result.current.notice).toMatch(/読み込めません/);act(()=>a.result.current.toggle(event));expect(a.result.current.notice).toBe('');
  act(()=>window.dispatchEvent(new StorageEvent('storage',{key:BOOKMARKS_KEY,newValue:'[]'})));expect(a.result.current.items).toHaveLength(0);
 });
});
