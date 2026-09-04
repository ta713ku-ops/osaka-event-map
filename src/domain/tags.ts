import type { EventItem, EventTag } from '../types';

export const EVENT_TAG_LABELS: Record<EventTag, string> = {
  celebrity: '有名人来場',
  exhibition: '展覧会',
  family: '親子',
  free: '無料',
  limited: '期間限定',
};

/**
 * Read the collector's evidence-backed tags while keeping old data usable.
 * Only boolean/category fields with an unambiguous meaning are used as fallbacks;
 * celebrity and limited remain opt-in data fields rather than guesses.
 */
export function hasEventTag(event: Pick<EventItem, 'tags' | 'freeEvent' | 'childFriendly' | 'category'>, tag: EventTag): boolean {
  if (event.tags?.includes(tag)) return true;
  if (tag === 'free') return event.freeEvent === true;
  if (tag === 'family') return event.childFriendly === true;
  if (tag === 'exhibition') return event.category === 'exhibition';
  return false;
}

export function eventTagLabels(event: Pick<EventItem, 'tags' | 'freeEvent' | 'childFriendly' | 'category'>): string[] {
  return (Object.keys(EVENT_TAG_LABELS) as EventTag[])
    .filter((tag) => hasEventTag(event, tag))
    .map((tag) => EVENT_TAG_LABELS[tag]);
}
