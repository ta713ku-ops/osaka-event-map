import type { EventItem, TimeFilter } from '../types';

const day = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
const dateOnly = (s?: string) => s ? s.slice(0, 10) : '';
const asDate = (s?: string, endOfDay = false) => {
  if (!s) return undefined;
  if (s.length === 10) return new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`);
  return new Date(s);
};

const dateTime = (date: string | undefined, time: string | undefined, endOfDay = false) => {
  if (!date) return undefined;
  const normalizedTime = time?.trim().replace(/時/g, ':').replace(/分/g, '').slice(0, 8);
  return asDate(`${date}T${normalizedTime || (endOfDay ? '23:59:59' : '00:00:00')}+09:00`);
};

const eventStart = (event: EventItem) => asDate(event.startAt) ?? dateTime(event.startDate, event.startTime);

const eventEnd = (event: EventItem) => {
  const start = eventStart(event);
  let end = asDate(event.endAt)
    ?? (event.endDate ? dateTime(event.endDate, event.endTime, true) : dateTime(event.startDate, event.endTime, true));
  // A single-day record without an end time is valid through that day's close.
  if (!end && event.startDate) end = dateTime(event.startDate, undefined, true);
  // A source may give an overnight endTime without an endDate. Keep it on the
  // following day instead of making the event look already finished.
  if (end && start && end < start && !event.endDate) end = new Date(end.getTime() + 86400000);
  return end;
};

export function isOngoing(event: EventItem, now = new Date()): boolean {
  const start = eventStart(event);
  const end = eventEnd(event);
  return !!start && !!end && start <= now && now <= end;
}
export function isFinished(event: EventItem, now = new Date()): boolean {
  const end = eventEnd(event);
  return !!end && end < now;
}
export function filterEvents(events: EventItem[], filter: TimeFilter = 'all', now = new Date()): EventItem[] {
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86400000));
  // Derive the weekend from the Osaka calendar, independent of host locale.
  const osakaParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
  const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(osakaParts);
  const weekdayOffset = osakaParts === 'Sun' ? -1 : 5 - weekdayIndex;
  const saturday = new Date(`${today}T12:00:00+09:00`);
  saturday.setUTCDate(saturday.getUTCDate() + weekdayOffset);
  const sunday = new Date(saturday.getTime() + 86400000);
  const weekendDates = new Set([day(saturday), day(sunday)]);
  return events.filter(e => {
    if (isFinished(e, now)) return false;
    const start = eventStart(e);
    const end = eventEnd(e);
    const startsOrSpans = (date: string) => dateOnly(e.startDate) <= date && dateOnly(e.endDate ?? e.startDate) >= date;
    if (filter === 'all') return true;
    if (filter === 'today') return startsOrSpans(today);
    if (filter === 'tomorrow') return startsOrSpans(tomorrow);
    if (filter === 'weekend') return [...weekendDates].some(startsOrSpans);
    // Tonight means a record whose published daily clock overlaps 18:00 to
    // midnight. A long startAt/endAt interval alone is a date range, not a
    // promise that the venue is open tonight.
    const hasDailyTime = !!e.startTime || !!e.endTime;
    const tonightStart = dateTime(today, '18:00');
    const tonightEnd = dateTime(today, undefined, true);
    const overlapsTonight = !!start && !!end && !!tonightStart && !!tonightEnd
      && start <= tonightEnd && end >= tonightStart;
    return hasDailyTime && startsOrSpans(today) && !!start && !!end && end >= now && day(start) === today && overlapsTonight;
  });
}

export function duplicateKey(event: Pick<EventItem, 'eventName'|'venueName'|'address'|'startDate'>): string {
  return [event.eventName, event.venueName ?? '', event.address ?? '', event.startDate]
    .map(v => v.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s\u3000\p{P}\p{S}]+/gu, '').trim()).join('|');
}
export function deduplicateEvents(events: EventItem[]): EventItem[] {
  const seen = new Set<string>();
  return events.filter(e => { const k = duplicateKey(e); if (seen.has(k)) return false; seen.add(k); return true; });
}
