export interface Channel {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  showInTvMode: boolean;
  tvModeOrder: number | null;
  status: ChannelStatus;
  lastCheckedAt?: string | null;
}

export type ChannelStatus = 'Active' | 'Reported' | 'Proxy' | 'Archived' | string;

export interface Category {
  id: string;
  name: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export interface ChannelQuery {
  category?: string;
  search?: string;
  showInTvMode?: boolean;
  ids?: string[];
  page?: number;
  pageSize?: number;
}

export interface ChannelPlaybackReport {
  status: 'online' | 'slow' | 'failed' | 'reported';
  reason?: string;
}

export interface ChannelUpdateRequest {
  streamUrl?: string;
  status?: ChannelStatus;
  isActive?: boolean;
}

export interface ChannelCreateRequest {
  name: string;
  streamUrl: string;
  categoryName: string;
  showInTvMode: boolean;
}

export interface ChannelOrderItem {
  id: string;
  position: number;
}

export interface ChannelRepairResponse {
  id: string;
  repaired: boolean;
  streamUrl: string | null;
  status: ChannelStatus;
  message: string;
}
