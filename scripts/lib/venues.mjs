import {normalize, normalizeEventRecord, normalizeDate, validDateRange} from './events.mjs';

const CALENDAR_DETAIL_FIELDS = new Set(['description', 'price', 'freeEvent', 'timeInfo', 'reservationInfo', 'reservationRequired', 'reservationUrl', 'contact', 'accessByTransit', 'accessByCar', 'nearestStation', 'rainPolicy', 'parkingInfo']);
const CALENDAR_SUPPORT_FIELDS = new Set(['descriptionHighlights', 'participationConditions', 'transitRoute', 'priceConditions', 'priceExemptions']);
function recentEvidence(quote, now) {
  const age = now.getTime() - new Date(quote?.checkedAt).getTime();
  return !!quote?.sourceUrl && !!quote.text && age >= 0 && age <= 14 * 86400000;
}
function calendarDetailMatches(event, item, now) {
  const scope = item.calendarDetailScope;
  if (scope?.kind !== 'verified-calendar-details' || scope.officialUrl !== event.officialUrl
    || normalize(item.eventName) !== normalize(event.eventName) || item.sourceId !== event.sourceId
    || !validDateRange(event.startDate, event.endDate) || !normalizeDate(scope.officialStartDate)
    || !recentEvidence(scope.officialPeriodEvidence, now)
    || scope.officialPeriodEvidence.sourceUrl !== scope.officialUrl
    || event.startDate < scope.officialStartDate || (scope.officialEndDate && event.endDate > scope.officialEndDate)
    || !recentEvidence({sourceUrl:scope.calendarUrl,text:'snapshot',checkedAt:event.lastCheckedAt}, now)) return false;
  const dates = event.schedule?.dates ?? (event.startDate === event.endDate ? [event.startDate] : []);
  if (!dates.length || dates[0] !== event.startDate || dates.at(-1) !== event.endDate) return false;
  return dates.every(date => scope.confirmedCalendarDates?.includes(date) && Object.values(event.fieldEvidence ?? {}).some(quote =>
    quote.sourceUrl === scope.calendarUrl && recentEvidence(quote, now) && quote.text.includes(`"${date}"`)));
}

/** Apply only an exact venue or an explicit room within it. Source ids alone
 * do not establish the venue of off-site concerts, tours, or workshops. */
export function enrichVenues(events, registry = []) {
  return events.map(event => {
    const name = normalize(event.venueName ?? '');
    const venue = registry.find(item => item.aliases.some(alias => {
      const key = normalize(alias);
      return name === key || (name.startsWith(key) && item.roomSuffixes?.some(suffix => name.slice(key.length).startsWith(normalize(suffix))));
    }));
    if (!venue) return event;
    const fields = {}, evidence = {};
    for (const [key,value] of Object.entries(venue.fields)) {
      if (event[key] !== undefined && event[key] !== null && event[key] !== '') continue;
      if (!venue.fieldEvidence?.[key]?.sourceUrl || !venue.fieldEvidence[key].checkedAt) continue;
      fields[key] = value; evidence[key] = venue.fieldEvidence[key];
    }
    return {...event,...fields,fieldEvidence:{...event.fieldEvidence,...evidence}};
  });
}

/** Manually reviewed first-party facts are bounded to one named occurrence. */
export function enrichVerifiedFacts(events, facts = [], { now = new Date() } = {}) {
  now = now instanceof Date ? now : new Date(now);
  return events.map(event => {
    const item = facts.find(fact => fact.calendarDetailScope ? calendarDetailMatches(event, fact, now)
      : fact.sourceId === event.sourceId && fact.eventName === event.eventName && fact.startDate === event.startDate);
    if (!item) return event;
    const calendarDetails = !!item.calendarDetailScope;
    const fields = {}, evidence = {};
    for (const [key,value] of Object.entries(item.fields)) {
      if (calendarDetails && (!CALENDAR_DETAIL_FIELDS.has(key) || !recentEvidence(item.fieldEvidence?.[key], now))) continue;
      if (!item.fieldEvidence?.[key]?.sourceUrl || !item.fieldEvidence[key].checkedAt) continue;
      fields[key] = value; evidence[key] = item.fieldEvidence[key];
    }
    // Supporting quotes (for example fee exemptions or daily exceptions)
    // remain useful evidence even when they are not separate display fields.
    for (const [key, quote] of Object.entries(item.fieldEvidence ?? {})) {
      if (calendarDetails && ((!CALENDAR_DETAIL_FIELDS.has(key) && !CALENDAR_SUPPORT_FIELDS.has(key)) || !recentEvidence(quote, now))) continue;
      if (quote?.sourceUrl && quote.checkedAt && quote.text) evidence[key] = quote;
    }
    const merged = {...event,...fields,fieldEvidence:{...event.fieldEvidence,...evidence}};
    if (Object.hasOwn(fields, 'price')) {
      // A new reviewed price supersedes a previously inferred free flag.
      // An explicit freeEvent in this same review remains authoritative.
      const { free: oldFreeEvidence, ...otherTagEvidence } = merged.tagEvidence ?? {};
      const normalized = normalizeEventRecord({ ...merged, freeEvent: fields.freeEvent,
        tags: (merged.tags ?? []).filter((tag) => tag !== 'free'), tagEvidence: otherTagEvidence }, {
        sourceId: merged.sourceId, sourceName: merged.source, sourceUrl: merged.sourceUrl,
        checkedAt: merged.lastCheckedAt, sourceStatus: merged.sourceStatus,
      });
      if (normalized) {
        merged.freeEvent = normalized.freeEvent;
        merged.tags = normalized.tags;
        merged.tagEvidence = normalized.tagEvidence;
      }
    }
    return merged;
  });
}
