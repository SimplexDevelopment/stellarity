// ============================================================
// Discovery Types — Central server instance discovery
// ============================================================

import type { InstanceInfo } from './instance.js';

/** A listing in the discovery directory */
export interface DiscoveryListing {
  instance: InstanceInfo;
  featured: boolean;
  category: DiscoveryCategory | null;
  boostScore: number; // For sorting (verified, popular, etc.)
}

/** Categories for browsing instances */
export type DiscoveryCategory =
  | 'gaming'
  | 'music'
  | 'education'
  | 'science'
  | 'technology'
  | 'art'
  | 'social'
  | 'community'
  | 'other';

/** Query parameters for discovery search */
export interface DiscoveryQuery {
  search?: string;
  tags?: string[];
  category?: DiscoveryCategory;
  region?: string;
  sort?: DiscoverySortOrder;
  page?: number;
  limit?: number;
}

export type DiscoverySortOrder = 'members' | 'newest' | 'name' | 'relevance';

/** Paginated discovery results */
export interface DiscoveryResults {
  listings: DiscoveryListing[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Registration request from instance → central */
export interface DiscoveryRegistration {
  instanceName: string;
  description: string | null;
  url: string;
  publicKey: string;
  tags: string[];
  region: string | null;
  iconUrl: string | null;
  maxMembers: number;
}

/** Heartbeat from instance → central */
export interface DiscoveryHeartbeat {
  instanceId: string;
  memberCount: number;
  status: 'online' | 'maintenance';
}
