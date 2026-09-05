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
export interface RecommendationEvidence {
  verified?: string; official?: boolean; publishedHours?: string;
  scale?: 'major' | 'medium' | 'local'; season?: string; topic?: string;
  osakaUnique?: string; organizer?: string; access?: string; reservation?: string;
}
export interface EventSchedule {
  evidence?: string; weekdays?: number[]; closedDates?: string[]; daily?: boolean; dates?: string[];
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
  recommendationEvidence?: RecommendationEvidence;
  schedule?: EventSchedule;
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

/**
 * A deliberately separate contract for the optional collection-coverage
 * snapshot. Coverage describes what we monitor; it is not an event count and
 * must never be used as a substitute for EventDataFile.events.
 */
export type CoverageHealth = 'tracked' | 'healthy' | 'warning' | 'gap';

export interface CoverageDimension {
  id: string;
  name: string;
  status: CoverageHealth;
  count?: number;
  checkedAt?: string;
  url?: string;
  note?: string;
}

export interface CoverageCandidateItem {
  id: string;
  name: string;
  discoveredFrom?: string;
  officialUrl?: string;
  detectedAt?: string;
  verification?: string;
  note?: string;
}

export interface CoverageSummary {
  tracked?: number;
  healthy?: number;
  warning?: number;
  gap?: number;
  total?: number;
  records?: number;
  sources?: CoverageDimension[];
}

export interface CoverageDataFile {
  schemaVersion?: number;
  generatedAt?: string;
  summary?: CoverageSummary;
  sources?: CoverageDimension[];
  categories?: CoverageDimension[];
  venues?: CoverageDimension[];
  candidates?: CoverageCandidateItem[];
  limitations?: string[];
}
