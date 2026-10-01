import { describe, expect, it } from 'vitest';
import { recommendHomeEvents, recommendWeekendEvents } from './homeRecommendations';
import type { EventItem } from '../types';

const e = (id: string, extra: Partial<EventItem> = {}): EventItem => ({ id, eventName: id, category: 'art', startDate: '2026-09-05', venueName: `venue-${id}`, officialUrl: 'https://example.test', sourceStatus: 'success', lastCheckedAt: '2026-09-04T00:00:00Z', ...extra });

describe('recommendHomeEvents', () => {
  it('keeps purchases and supporter recruitment out of weekend picks, without excluding a craft workshop with a market', () => {
    const now = new Date('2026-09-04T12:00:00+09:00');
    const events = [
      e('supporters', { eventName: 'ユニセフ サポーター参加者募集キャンペーン' }),
      e('cosmetics', { description: '参加条件：商品をお買い上げの方' }),
      e('brand', { description: '税込5万円のご購入で一口エントリーいただける抽選' }),
      e('craft', { eventName: '陶芸体験', description: '手作りの体験会とマルシェ。作品を販売します。' }),
      e('craft-other', { eventName: '陶芸体験', venueName: '別の会場' }),
    ];
    const picks = recommendWeekendEvents(events, now);
    expect(picks).toHaveLength(1);
    expect(picks[0].eventName).toBe('陶芸体験');
  });
  it('keeps recruitment and registered-member programs out of outing recommendations', () => {
    const now = new Date('2026-09-04T12:00:00+09:00');
    const entries = [
      e('volunteer', { eventName: '竹林保全活動ボランティア募集<要事前申込>' }),
      e('registered', { eventName: 'ザリガニハンター<登録済者のみ>' }),
      e('promotion', { eventName: 'イオンモールの超!COOOOOOL作戦' }),
      e('workshop', { eventName: '自然観察体験<要事前申込>' }),
    ];
    expect(recommendWeekendEvents(entries, now).map(event => event.id)).toEqual(['workshop']);
  });
  it('requires explicit large-event signals and official venue evidence', () => {
    const r = recommendHomeEvents([e('plain'), e('special', { eventName: '特別展 大阪の美術', description: '大阪の美術作品を紹介する特別展。' })], new Date('2026-09-05T00:00:00Z'));
    expect(r.large.map(x => x.event.id)).toEqual(['special']);
    expect(r.diagnostics.large.find(x => x.event.id === 'plain')?.exclusions.length).toBeGreaterThan(0);
  });
  it('keeps ordering deterministic when input order changes', () => {
    const a = [e('b', { imageUrl: 'https://x/b.jpg' }), e('a', { imageUrl: 'https://x/a.jpg', eventName: '祭' })];
    const one = recommendHomeEvents(a, new Date('2026-09-05T00:00:00Z')).large.map(x => x.event.id);
    const two = recommendHomeEvents(a.reverse(), new Date('2026-09-05T00:00:00Z')).large.map(x => x.event.id);
    expect(one).toEqual(two);
  });
  it('excludes finished and ambiguous recurring events from today', () => {
    const r = recommendHomeEvents([e('done', { startDate: '2026-09-01', endDate: '2026-09-04' }), e('contest', { eventName: '応募コンテスト', endDate: '2026-09-20', scheduleType: 'contest' })], new Date('2026-09-05T00:00:00Z'));
    expect(r.today).toHaveLength(0);
  });
  it('does not duplicate an event between tiers', () => {
    const r = recommendHomeEvents([e('festival', { eventName: 'フェスティバル', startTime: '10:00', endTime: '18:00' })], new Date('2026-09-05T00:00:00Z'));
    expect([...r.large, ...r.today].filter(x => x.event.id === 'festival')).toHaveLength(1);
  });

  it('rejects impossible dates and events that have ended', () => {
    const r = recommendHomeEvents([
      e('bad', { eventName: '特別展', startDate: '2026-02-30' }),
      e('ended', { eventName: '特別展', startDate: '2026-09-01', endDate: '2026-09-04' }),
    ], new Date('2026-09-05T03:00:00+09:00'));
    expect(r.large).toHaveLength(0);
    expect(r.today).toHaveLength(0);
  });

  it('honors only evidence-backed daily and closed-date schedules', () => {
    const daily = e('daily', { endDate: '2026-09-10', schedule: { daily: true, evidence: '公式日程' } });
    const closed = e('closed', { endDate: '2026-09-10', schedule: { daily: true, closedDates: ['2026-09-05'], evidence: '公式日程' } });
    const unverified = e('unverified', { endDate: '2026-09-10', schedule: { daily: true } });
    const r = recommendHomeEvents([daily, closed, unverified], new Date('2026-09-05T03:00:00+09:00'));
    expect(r.today.map(x => x.event.id)).toEqual(['daily']);
  });

  it('excludes a same-day event after its published closing time', () => {
    const r = recommendHomeEvents([e('morning', { startTime: '09:00', endTime: '10:00' })], new Date('2026-09-05T10:01:00+09:00'));
    expect(r.today).toHaveLength(0);
    expect(r.diagnostics.today[0].exclusions).toContain('本日の終了時刻を過ぎた');
  });

  it('converts ISO timestamps to Osaka time before deciding an event has ended', () => {
    const r = recommendHomeEvents([e('utc', { startAt: '2026-09-06T01:00:00.000Z', endAt: '2026-09-06T08:00:00.000Z', startDate: '2026-09-06', lastCheckedAt: '2026-09-05T00:00:00Z' })], new Date('2026-09-06T10:00:00+09:00'));
    expect(r.today.map(x => x.event.id)).toContain('utc');
  });

  it('does not recommend applications and online displays as visits', () => {
    const r = recommendHomeEvents([
      e('photo', { eventName: 'フォトコンテスト作品募集', endDate: '2026-09-30', startTime: '10:00' }),
      e('web', { eventName: 'デザイン展', endDate: '2026-09-30', description: 'WEB上で作品を展示します', startTime: '10:00' }),
    ], new Date('2026-09-05T03:00:00+09:00'));
    expect(r.large).toHaveLength(0);
    expect(r.today).toHaveLength(0);
  });

  it('prevents repeated images and one facility from occupying the strict pass', () => {
    const entries = ['a', 'b', 'c'].map((id, index) => e(id, {
      eventName: `特別展${id}`, venueName: `同じ美術館 ${index + 1}階`,
      sourceId: 'nakka-art-museum', imageUrl: index < 2 ? 'https://example.test/shared.jpg' : `https://example.test/${id}.jpg`,
    }));
    const r = recommendHomeEvents(entries, new Date('2026-09-05T03:00:00+09:00'));
    expect(new Set(r.large.map(x => x.event.imageUrl)).size).toBe(r.large.length);
    expect(r.large.filter(x => x.event.sourceId === 'nakka-art-museum').length).toBeLessThanOrEqual(2);
  });

  it('keeps image-less quality events eligible and records explanations', () => {
    const r = recommendHomeEvents([e('festival', { eventName: '大阪秋祭り', venueName: '大阪公園', description: '公園の広場で秋の催しを楽しめる。' })], new Date('2026-09-05T03:00:00+09:00'));
    expect(r.large[0]?.event.id).toBe('festival');
    expect(r.large[0]?.reasons.length).toBeGreaterThan(0);
    expect(r.large[0]?.components).toHaveProperty('visual', 0);
  });
  it('does not put an event without an introduction in the editorial spotlight', () => {
    const r = recommendHomeEvents([e('concert', { eventName: '大阪音楽祭', sourceId: 'festival-hall', imageUrl: 'https://example.test/poster.jpg' })], new Date('2026-09-05T03:00:00+09:00'));
    expect(r.large).toHaveLength(0);
    expect(r.diagnostics.large[0].exclusions).toContain('紹介文がなく注目枠の判断材料が不足');
  });
});
