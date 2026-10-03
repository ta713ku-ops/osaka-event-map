import { readFileSync } from 'node:fs';
import { normalizeEvidenceText, visibleText } from './verified-outings.mjs';

const DATA = JSON.parse(readFileSync(new URL('../../data/seasonal-guides.json', import.meta.url), 'utf8'));
const MAX_AGE = 14 * 86400000;

/** Forecasts have no startDate/endDate and never enter the dated event collection. */
export async function collectSeasonalGuides({ fetchText, now = new Date(), guides = DATA }) {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now);
  const output = [];
  for (const guide of guides) {
    if (guide.validThroughMonth < currentMonth || 'startDate' in guide || 'endDate' in guide) continue;
    const evidence = Object.values(guide.fieldEvidence);
    const pages = new Map();
    let fetchFailed = false;
    for (const url of new Set(evidence.map(item => item.sourceUrl))) {
      try { pages.set(url, normalizeEvidenceText(visibleText(await fetchText(url)))); }
      catch { fetchFailed = true; }
    }
    // A successfully fetched page contradicting its saved quote withdraws the guide.
    if (evidence.some(item => !item.text || !item.sourceUrl || (pages.has(item.sourceUrl) && !pages.get(item.sourceUrl).includes(normalizeEvidenceText(item.text))))) continue;
    if (fetchFailed) {
      const ages = evidence.map(item => now.getTime() - new Date(item.checkedAt).getTime());
      if (ages.some(age => !Number.isFinite(age) || age < 0 || age > MAX_AGE)) continue;
      output.push({ ...guide, sourceStatus: 'stale' });
    } else {
      const checkedAt = now.toISOString();
      output.push({ ...guide, sourceStatus: 'success', lastCheckedAt: checkedAt,
        fieldEvidence: Object.fromEntries(Object.entries(guide.fieldEvidence).map(([key, value]) => [key, { ...value, checkedAt }])) });
    }
  }
  return output;
}
