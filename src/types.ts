export type EventCategory = string;

export interface EventItem {
  id: string;
  eventName: string;
  venueName?: string;
  category: EventCategory;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  startDate: string;
  endDate?: string;
  startAt?: string;
  endAt?: string;
  startTime?: string;
  endTime?: string;
  price?: string | number | null;
  freeEvent?: boolean | null;
  indoor?: boolean | null;
  outdoor?: boolean | null;
  rainSupport?: boolean | null;
  parking?: boolean | null;
  childFriendly?: boolean | null;
  dateFriendly?: boolean | null;
  officialUrl?: string;
  imageUrl?: string;
  imageSource?: string;
  imageSourceUrl?: string;
  imageLicense?: string;
  source?: string;
  sourceUrl?: string;
  lastCheckedAt?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  companion?: 'solo' | 'partner' | 'friends' | 'family' | string;
  hasChildren?: boolean;
  childAge?: string;
  transport?: 'car' | 'train' | 'walk' | string;
  favoriteCategories?: string[];
  maxTravelMinutes?: 30 | 60 | 90 | null;
}

export type TimeFilter = 'all' | 'today' | 'tomorrow' | 'tonight' | 'weekend';
export interface Coordinates { latitude: number; longitude: number }
