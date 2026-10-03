import type { EventFilters } from '../components/FilterSheet';
import type { SeasonalGuide, TimeFilter } from '../types';
import { AREAS } from './discovery';

export function visibleSeasonalGuides(guides: SeasonalGuide[], query: string, timeFilter: TimeFilter, filters: EventFilters, now: Date): SeasonalGuide[] {
  if (timeFilter !== 'all' || filters.selectedDate || filters.time || filters.feature || filters.withinMinutes || filters.free || filters.rainOk || filters.family || filters.date || filters.night || filters.tags?.length || filters.categories?.length) return [];
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now);
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase('ja');
  return guides.filter(guide => {
    if (guide.validThroughMonth < month) return false;
    const age = now.getTime() - new Date(guide.lastCheckedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > 14 * 86400000) return false;
    if (filters.area && AREAS.find(([, , pattern]) => pattern.test(guide.address))?.[0] !== filters.area) return false;
    return `${guide.title} ${guide.venueName} ${guide.address}`.normalize('NFKC').toLocaleLowerCase('ja').includes(needle);
  });
}
