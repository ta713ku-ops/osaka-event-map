import type { EventItem, TimeFilter } from '../types';

const day = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
const dateOnly = (s?: string) => s ? s.slice(0, 10) : '';
const asDate = (s?: string, endOfDay = false) => {
  if (!s) return undefined;
  if (s.length === 10) return new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`);
  return new Date(s);
};

export function isOngoing(event: EventItem, now = new Date()): boolean {
  const start = asDate(event.startAt) ?? asDate(event.startDate);
  const end = asDate(event.endAt) ?? asDate(event.endDate, true) ?? start;
  return !!start && !!end && start <= now && now <= end;
}
export function isFinished(event: EventItem, now = new Date()): boolean {
  const end = asDate(event.endAt) ?? asDate(event.endDate, true);
  return !!end && end < now;
}
export function filterEvents(events: EventItem[], filter: TimeFilter = 'all', now = new Date()): EventItem[] {
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86400000));
  // Derive the weekend from the Osaka calendar, independent of host locale.
  const osakaParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
  const weekdayOffset = osakaParts === 'Sun' ? -1 : 6 - ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(osakaParts);
  const saturday = new Date(`${today}T12:00:00+09:00`);
  saturday.setUTCDate(saturday.getUTCDate() + weekdayOffset);
  const sunday = new Date(saturday.getTime() + 86400000);
  const weekendDates = new Set([day(saturday), day(sunday)]);
  return events.filter(e => {
    if (isFinished(e, now)) return false;
    const start = asDate(e.startAt) ?? asDate(e.startDate);
    const end = asDate(e.endAt) ?? asDate(e.endDate, true) ?? start;
    const startsOrSpans = (date: string) => dateOnly(e.startDate) <= date && dateOnly(e.endDate ?? e.startDate) >= date;
    if (filter === 'all') return true;
    if (filter === 'today') return startsOrSpans(today);
    if (filter === 'tomorrow') return startsOrSpans(tomorrow);
    if (filter === 'weekend') return [...weekendDates].some(startsOrSpans);
    // Tonight requires an explicit source time. Unknown all-day data must not be promoted as an evening option.
    const hasExplicitTime = !!e.startTime || !!e.endTime;
    return hasExplicitTime && startsOrSpans(today) && !!start && !!end && end >= now && start.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) === today;
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
