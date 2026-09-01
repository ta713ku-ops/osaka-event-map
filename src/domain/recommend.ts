import type { EventItem, UserProfile } from '../types';
export function recommendationScore(event: EventItem, profile: UserProfile = {}, distanceKm?: number): number {
  let score = 50;
  if (profile.favoriteCategories?.includes(event.category)) score += 25;
  if (profile.hasChildren === true && event.childFriendly === true) score += 12;
  if (profile.companion === 'partner' && event.dateFriendly === true) score += 10;
  if (event.freeEvent === true) score += 4;
  if (typeof distanceKm === 'number' && profile.maxTravelMinutes) {
    const minutes = estimateMinutes(distanceKm, profile.transport);
    score += minutes <= profile.maxTravelMinutes ? 9 : -12;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
export const calculateRecommendationScore = recommendationScore;
function estimateMinutes(km: number, mode?: string) { return Math.ceil(km / (mode === 'walk' ? 4.5 : mode === 'car' ? 30 : 25) * 60); }
