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

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function scheduleHasOfficialEvidence(event: EventItem) {
  return Boolean(event.schedule?.evidence || event.recommendationEvidence?.verified);
}

function scheduleOccursOnDate(event: EventItem, date: string) {
  const schedule = event.schedule;
  if (!schedule) return undefined;
  if (schedule.closedDates?.includes(date)) return false;
  if (schedule.dates) return schedule.dates.includes(date);
  if (schedule.weekdays) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return schedule.weekdays.includes(weekday);
  }
  if (schedule.daily) return true;
  return undefined;
}

/** Whether an event's published date range includes a date, accounting for
 * official discrete schedules, weekdays, and closure dates when present. */
export function occursOnDate(event: EventItem, date: string): boolean {
  if (!validDate(date) || !validDate(dateOnly(event.startDate))) return false;
  const start = dateOnly(event.startDate);
  const end = dateOnly(event.endDate ?? event.startDate);
  if (!validDate(end) || end < start || date < start || date > end) return false;
  return scheduleOccursOnDate(event, date) ?? true;
}

function isUnavailableScheduleStatus(event: EventItem) {
  return event.officialStatus === 'cancelled' || event.officialStatus === 'postponed';
}

export function isOngoing(event: EventItem, now = new Date()): boolean {
  if (isUnavailableScheduleStatus(event)) return false;
  const start = eventStart(event);
  const end = eventEnd(event);
  return !!start && !!end && start <= now && now <= end && occursOnDate(event, day(now));
}
export function isFinished(event: EventItem, now = new Date()): boolean {
  if (isUnavailableScheduleStatus(event)) return true;
  const end = eventEnd(event);
  return !!end && end < now;
}
export function filterEvents(events: EventItem[], filter: TimeFilter = 'all', now = new Date()): EventItem[] {
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86400000));
  const upcomingEnd = day(new Date(now.getTime() + 7 * 86400000));
  // Derive the weekend from the Osaka calendar, independent of host locale.
  const osakaParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
  const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(osakaParts);
  const weekdayOffset = osakaParts === 'Sun' ? -1 : 5 - weekdayIndex;
  const saturday = new Date(`${today}T12:00:00+09:00`);
  saturday.setUTCDate(saturday.getUTCDate() + weekdayOffset);
  const sunday = new Date(saturday.getTime() + 86400000);
  const weekendDates = new Set([day(saturday), day(sunday)]);
  return events.filter(e => {
    if (isFinished(e, now) || isUnavailableScheduleStatus(e)) return false;
    if (filter === 'all') return true;
    if (filter === 'today') return occursOnDate(e, today);
    if (filter === 'tomorrow') return occursOnDate(e, tomorrow);
    if (filter === 'upcoming') return dateOnly(e.startDate) > today && dateOnly(e.startDate) <= upcomingEnd;
    if (filter === 'weekend') return [...weekendDates].some(date => occursOnDate(e, date));
    // Tonight means a record whose published daily clock overlaps 18:00 to
    // midnight. A long startAt/endAt interval alone is a date range, not a
    // promise that the venue is open tonight.
    const hasDailyTime = !!e.startTime && !!e.endTime;
    const tonightStart = dateTime(today, '18:00');
    const tonightEnd = dateTime(today, undefined, true);
    const hasOccurrenceEvidence = e.startDate === (e.endDate ?? e.startDate) || (scheduleHasOfficialEvidence(e) && scheduleOccursOnDate(e, today) === true);
    if (!hasDailyTime || !hasOccurrenceEvidence || !occursOnDate(e, today) || !tonightStart || !tonightEnd) return false;
    const dailyStart = dateTime(today, e.startTime);
    let dailyEnd = dateTime(today, e.endTime);
    if (!dailyStart || !dailyEnd) return false;
    if (dailyEnd < dailyStart) dailyEnd = new Date(dailyEnd.getTime() + 86400000);
    const overlapsTonight = dailyStart <= tonightEnd && dailyEnd >= tonightStart;
    return overlapsTonight && dailyEnd >= now;
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
