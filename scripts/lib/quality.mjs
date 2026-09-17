import { duplicateKey, httpUrl, normalizeDate, textValue } from './events.mjs';

const FIELD_CHECKS = Object.freeze({
  venueName: (event) => Boolean(textValue(event.venueName)),
  address: (event) => Boolean(textValue(event.address)),
  description: (event) => Boolean(textValue(event.description)),
  startTime: (event) => Boolean(textValue(event.startTime)),
  endTime: (event) => Boolean(textValue(event.endTime)),
  price: (event) => event.price !== undefined && event.price !== null && textValue(event.price) !== '',
  image: (event) => Boolean(httpUrl(event.imageUrl)),
  coordinates: (event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude),
  reservation: (event) => event.reservationRequired !== undefined || Boolean(textValue(event.reservationInfo)) || Boolean(httpUrl(event.reservationUrl)),
  contact: (event) => Boolean(event.contact && typeof event.contact === 'object' && Object.values(event.contact).some(textValue)),
  fieldEvidence: (event) => Boolean(event.fieldEvidence && typeof event.fieldEvidence === 'object' && Object.keys(event.fieldEvidence).length),
});

function validCheckedAt(value) {
  const candidate = textValue(value);
  return Boolean(candidate && Number.isFinite(new Date(candidate).getTime()));
}

export function publicationIssues(event) {
  const issues = [];
  if (!event || typeof event !== 'object') return ['invalid_record'];
  if (!textValue(event.eventName)) issues.push('event_name');
  const startDate = normalizeDate(event.startDate);
  const endDate = normalizeDate(event.endDate || event.startDate);
  if (!startDate || !endDate || endDate < startDate) issues.push('date');
  if (!httpUrl(event.officialUrl)) issues.push('official_url');
  if (!textValue(event.sourceId)) issues.push('source_id');
  if (!validCheckedAt(event.lastCheckedAt)) issues.push('checked_at');
  const hasLocation = Boolean(textValue(event.venueName) || textValue(event.address))
    || (Number.isFinite(event.latitude) && Number.isFinite(event.longitude));
  if (!hasLocation) issues.push('venue_evidence');
  return issues;
}

export function partitionPublishable(events) {
  const accepted = [];
  const rejected = [];
  for (const event of Array.isArray(events) ? events : []) {
    const issues = publicationIssues(event);
    if (issues.length) rejected.push({ event, issues });
    else accepted.push(event);
  }
  return { accepted, rejected };
}

function percentage(count, total) {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

export function qualitySummary(events, { rejected = [] } = {}) {
  const published = Array.isArray(events) ? events : [];
  const fields = Object.fromEntries(Object.entries(FIELD_CHECKS).map(([name, check]) => {
    const count = published.filter(check).length;
    return [name, { count, percentage: percentage(count, published.length) }];
  }));
  const rejectionReasons = {};
  for (const entry of rejected) {
    for (const issue of entry.issues ?? []) rejectionReasons[issue] = (rejectionReasons[issue] ?? 0) + 1;
  }
  const duplicateCounts = new Map();
  for (const event of published) {
    const key = duplicateKey(event);
    if (key) duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  return {
    published: published.length,
    rejected: rejected.length,
    sourceCount: new Set(published.flatMap((event) => [
      textValue(event.sourceId),
      ...(Array.isArray(event.provenance) ? event.provenance.map((entry) => textValue(entry?.sourceId)) : []),
    ]).filter(Boolean)).size,
    duplicateGroups: [...duplicateCounts.values()].filter((count) => count > 1).length,
    rejectionReasons,
    fields,
  };
}

export const __test__ = Object.freeze({ FIELD_CHECKS, validCheckedAt });
