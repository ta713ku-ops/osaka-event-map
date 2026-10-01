import {normalize} from './events.mjs';

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
export function enrichVerifiedFacts(events, facts = []) {
  return events.map(event => {
    const item = facts.find(fact => fact.sourceId === event.sourceId && fact.eventName === event.eventName && fact.startDate === event.startDate);
    if (!item) return event;
    const fields = {}, evidence = {};
    for (const [key,value] of Object.entries(item.fields)) {
      if (!item.fieldEvidence?.[key]?.sourceUrl || !item.fieldEvidence[key].checkedAt) continue;
      fields[key] = value; evidence[key] = item.fieldEvidence[key];
    }
    return {...event,...fields,fieldEvidence:{...event.fieldEvidence,...evidence}};
  });
}
