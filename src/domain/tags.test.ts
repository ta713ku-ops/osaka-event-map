import { describe, expect, it } from 'vitest';
import { eventTagLabels, hasEventTag } from './tags';

describe('free search and older price snapshots', () => {
  it('finds a confirmed zero price even when the older free flag is null', () => {
    const event = { category: 'illumination', price: 0, freeEvent: null };
    expect(hasEventTag(event, 'free')).toBe(true);
    expect(eventTagLabels(event)).toContain('無料');
  });

  it('does not guess free admission from partial benefits or unknown prices', () => {
    for (const price of [undefined, null, '', '小学生以下無料。大人1,000円', '駐車場無料', '要問合せ', 1000]) {
      expect(hasEventTag({ category: 'exhibition', price }, 'free')).toBe(false);
    }
    expect(hasEventTag({ category: 'exhibition', price: 0, freeEvent: false }, 'free')).toBe(false);
    expect(hasEventTag({ category: 'exhibition', price: 0, freeEvent: false, tags: ['free'] }, 'free')).toBe(false);
  });

  it('retains explicit collector tags and positive evidence', () => {
    expect(hasEventTag({ category: 'other', tags: ['free'] }, 'free')).toBe(true);
    expect(hasEventTag({ category: 'other', freeEvent: true }, 'free')).toBe(true);
  });
});
