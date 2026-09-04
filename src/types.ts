export type EventCategory = string;

export const EVENT_TAGS = ['celebrity', 'exhibition', 'family', 'free', 'limited'] as const;
export type EventTag = typeof EVENT_TAGS[number];

export type EventSourceStatus = 'success' | 'error' | 'stale';

export interface EventSource {
  id: string;
  name: string;
  url: string;
  status: EventSourceStatus;
  count: number;
  checkedAt: string;
  error?: string;
}

export interface EventProvenance {
  sourceId?: string;
  source?: string;
  sourceUrl?: string;
  officialUrl?: string;
  lastCheckedAt?: string;
  evidence?: string;
}

export interface EventItem {
  id: string;
  eventName: string;
  venueName?: string;
  category: EventCategory;
  description?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
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
  sourceId?: string;
  tags?: EventTag[];
  tagEvidence?: Record<string, string>;
  provenance?: EventProvenance[];
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

export interface EventDataFile {
  schemaVersion?: number;
  generatedAt: string;
  freshness?: 'fresh' | 'partial' | 'stale' | string;
  attribution: { name: string; license: string; sourceUrl: string };
  sources?: EventSource[];
  events: EventItem[];
}
