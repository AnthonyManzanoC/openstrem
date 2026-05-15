import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdsConfig } from '../models/ads-config.model';
import {
  Category,
  Channel,
  ChannelCreateRequest,
  ChannelOrderItem,
  ChannelPlaybackReport,
  ChannelQuery,
  ChannelRepairResponse,
  ChannelUpdateRequest,
  PagedResult
} from '../models/channel.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getChannels(query: ChannelQuery = {}): Observable<PagedResult<Channel>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('pageSize', String(query.pageSize ?? 40));

    if (query.category) {
      params = params.set('category', query.category);
    }

    if (query.search) {
      params = params.set('search', query.search);
    }

    if (query.showInTvMode !== undefined) {
      params = params.set('showInTvMode', String(query.showInTvMode));
    }

    query.ids?.forEach((id) => {
      params = params.append('ids', id);
    });

    return this.http.get<PagedResult<Channel>>(`${this.apiUrl}/channels`, { params });
  }

  getReportedChannels(page = 1, pageSize = 100): Observable<PagedResult<Channel>> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));

    return this.http.get<PagedResult<Channel>>(`${this.apiUrl}/channels/reported`, { params });
  }

  createChannel(request: ChannelCreateRequest): Observable<Channel> {
    return this.http.post<Channel>(`${this.apiUrl}/channels`, request);
  }

  reorderTvChannels(channels: ChannelOrderItem[]): Observable<Channel[]> {
    return this.http.put<Channel[]>(`${this.apiUrl}/channels/reorder`, { channels });
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  reportChannelPlayback(channelId: string, report: ChannelPlaybackReport): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/channels/${channelId}/report`, report);
  }

  reportAndHealChannel(channelId: string, report: ChannelPlaybackReport): Observable<ChannelRepairResponse> {
    return this.http.post<ChannelRepairResponse>(`${this.apiUrl}/channels/${channelId}/report-and-heal`, report);
  }

  updateChannel(channelId: string, request: ChannelUpdateRequest): Observable<Channel> {
    return this.http.put<Channel>(`${this.apiUrl}/channels/${channelId}`, request);
  }

  setChannelTvMode(channelId: string, showInTvMode: boolean): Observable<Channel> {
    return this.http.patch<Channel>(`${this.apiUrl}/channels/${channelId}/tvmode`, { showInTvMode });
  }

  forceProxyChannel(channelId: string): Observable<ChannelRepairResponse> {
    return this.http.post<ChannelRepairResponse>(`${this.apiUrl}/channels/${channelId}/force-proxy`, {});
  }

  getAdsConfig(): Observable<AdsConfig> {
    return this.http.get<AdsConfig>(`${this.apiUrl}/config`);
  }
}
