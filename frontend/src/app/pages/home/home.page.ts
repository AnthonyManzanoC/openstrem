import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonRefresher,
  IonRefresherContent,
  IonToolbar
} from '@ionic/angular/standalone';
import type {
  InfiniteScrollCustomEvent,
  RefresherCustomEvent
} from '@ionic/angular';
import { finalize, timeout } from 'rxjs';
import { LazyLogoDirective } from '../../core/directives/lazy-logo.directive';
import { Category, Channel, ChannelRepairResponse } from '../../core/models/channel.model';
import { SearchPipe } from '../../core/pipes/search.pipe';
import { AdService } from '../../core/services/ad.service';
import { ApiService } from '../../core/services/api.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import {
  PlayerComponent,
  PlayerPlaybackStatus
} from '../../shared/player/player.component';

type ChannelHealth = 'healthy' | 'slow' | 'blocked' | 'reported' | 'unknown';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonRefresher,
    IonRefresherContent,
    SearchPipe,
    LazyLogoDirective,
    AdBannerComponent,
    PlayerComponent
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss'
})
export class HomePage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly favorites = inject(FavoritesService);
  readonly ads = inject(AdService);

  categories: Category[] = [];
  channels: Channel[] = [];
  selectedCategory: string | null = null;
  selectedChannel: Channel | null = null;
  searchTerm = '';
  loading = false;
  hasMore = true;
  totalCount = 0;
  errorMessage = '';
  playerInPip = false;
  readonly skeletonCards = Array.from({ length: 12 }, (_, index) => index);

  private page = 1;
  private readonly pageSize = 48;
  private readonly searchDelayMs = 280;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedReset = false;
  private readonly logoFailureIds = new Set<string>();
  private readonly channelHealth = new Map<string, ChannelHealth>();
  private readonly tvModeActionIds = new Set<string>();
  private readonly healthStorageKey = 'openstream.channel-health.v1';

  constructor(private router: Router) {
    this.restoreChannelHealth();
  }

  ngOnInit(): void {
    this.favorites.getClientId();
    void this.ads
      .loadConfig()
      .then(() => this.ads.showBanner())
      .catch(() => undefined);
    this.loadCategories();
    this.loadChannels(true);
  }

  ngOnDestroy(): void {
    this.clearSearchTimer();
  }

  goToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  goToWelcome(): void {
    void this.router.navigate(['/']);
  }

  goToHome(): void {
    void this.router.navigate(['/home']);
  }

  goToTv(): void {
    void this.router.navigate(['/tv']);
  }

  selectCategory(category: string | null): void {
    if (this.selectedCategory === category) {
      return;
    }

    this.selectedCategory = category;
    this.searchTerm = '';
    this.clearSearchTimer();
    this.loadChannels(true);
  }

  onSearchTermChange(term: string): void {
    this.searchTerm = term;
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => this.loadChannels(true), this.searchDelayMs);
  }

  clearSearch(): void {
    if (!this.searchTerm) {
      return;
    }

    this.searchTerm = '';
    this.clearSearchTimer();
    this.loadChannels(true);
  }

  refresh(event?: RefresherCustomEvent): void {
    this.loadCategories();
    this.loadChannels(true, event);
  }

  loadMore(event: InfiniteScrollCustomEvent): void {
    this.loadChannels(false, event);
  }

  openPlayer(channel: Channel): void {
    if (!this.selectedChannel) {
      this.playerInPip = false;
    }

    this.selectedChannel = channel;
    void this.ads.showInterstitial();
  }

  toggleTvMode(channel: Channel, event: MouseEvent): void {
    event.stopPropagation();

    if (this.tvModeActionIds.has(channel.id)) {
      return;
    }

    const updatedChannel = this.favorites.toggleFavorite(channel);
    this.channels = this.channels.map((item) =>
      item.id === channel.id ? updatedChannel : item
    );

    if (this.selectedChannel?.id === channel.id) {
      this.selectedChannel = updatedChannel;
    }
  }

  closePlayer(): void {
    this.playerInPip = false;
    this.selectedChannel = null;
  }

  handlePipModeChanged(active: boolean): void {
    this.playerInPip = active;
  }

  handlePlaybackStatus(status: PlayerPlaybackStatus): void {
    const channel = this.selectedChannel;

    if (!channel) {
      return;
    }

    const health: ChannelHealth = status === 'online'
      ? 'healthy'
      : status === 'slow'
        ? 'slow'
        : 'blocked';

    this.setChannelHealth(channel.id, health);
  }

  handlePlaybackReport(reason: string): void {
    const channel = this.selectedChannel;

    if (!channel) {
      return;
    }

    this.setChannelHealth(channel.id, 'reported');
  }

  handlePlaybackRepaired(response: ChannelRepairResponse): void {
    const channel = this.selectedChannel;

    if (!channel || response.id !== channel.id) {
      return;
    }

    const updatedChannel: Channel = {
      ...channel,
      streamUrl: response.streamUrl ?? channel.streamUrl,
      status: response.status
    };

    this.selectedChannel = updatedChannel;
    this.channels = this.channels.map((item) =>
      item.id === channel.id ? updatedChannel : item
    );
    this.setChannelHealth(channel.id, response.repaired ? 'healthy' : 'reported');
  }

  markLogoFailed(channel: Channel): void {
    this.logoFailureIds.add(channel.id);
  }

  hasLogoFailed(channel: Channel): boolean {
    return this.logoFailureIds.has(channel.id);
  }

  getInitials(name: string): string {
    const words = name
      .replace(/\([^)]*\)/g, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);

    if (words.length === 0) {
      return 'TV';
    }

    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  getChannelBadge(channel: Channel): string {
    const haystack = `${channel.name} ${channel.categoryName ?? ''}`.toLowerCase();

    if (/\b(4k|2160p|uhd)\b/.test(haystack)) {
      return '4K';
    }

    if (/\b(1080p|720p|hd|fhd)\b/.test(haystack)) {
      return 'HD';
    }

    if (/\b(usa|united states|english|uk|us)\b/.test(haystack)) {
      return 'EN';
    }

    if (/\b(ecuador|colombia|latam|latin|spanish|espanol|espana|mexico|argentina|chile|peru)\b/.test(haystack)) {
      return 'ES';
    }

    return 'LIVE';
  }

  getHealthState(channel: Channel): ChannelHealth {
    return this.channelHealth.get(channel.id) ?? 'unknown';
  }

  getHealthLabel(channel: Channel): string {
    const state = this.getHealthState(channel);

    if (state === 'healthy') {
      return 'Probado';
    }

    if (state === 'slow') {
      return 'Lento';
    }

    if (state === 'blocked') {
      return 'Requiere proxy';
    }

    if (state === 'reported') {
      return 'Reportado';
    }

    return 'Sin probar';
  }

  isTvModeBusy(channelId: string): boolean {
    return this.tvModeActionIds.has(channelId);
  }

  trackByChannelId(_: number, channel: Channel): string {
    return channel.id;
  }

  trackByCategoryId(_: number, category: Category): string {
    return category.id;
  }

  private loadCategories(): void {
    this.api.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: () => {
        this.categories = [];
      }
    });
  }

  private loadChannels(reset: boolean, event?: InfiniteScrollCustomEvent | RefresherCustomEvent): void {
    if (this.loading) {
      if (reset) {
        this.queuedReset = true;
      }

      event?.target.complete();
      return;
    }

    if (!reset && !this.hasMore) {
      event?.target.complete();
      return;
    }

    if (reset) {
      this.page = 1;
      this.channels = [];
      this.hasMore = true;
      this.totalCount = 0;
      this.errorMessage = '';
    }

    this.loading = true;

    this.api
      .getChannels({
        category: this.selectedCategory ?? undefined,
        search: this.searchTerm.trim() || undefined,
        page: this.page,
        pageSize: this.pageSize
      })
      .pipe(
        timeout(15000),
        finalize(() => {
          this.loading = false;
          event?.target.complete();

          if (this.queuedReset) {
            this.queuedReset = false;
            this.loadChannels(true);
          }
        })
      )
      .subscribe({
        next: (result) => {
          const localizedItems = this.favorites.applyPreferences(result.items);
          this.channels = reset ? localizedItems : [...this.channels, ...localizedItems];
          this.totalCount = result.totalCount;
          this.hasMore = result.hasMore;
          this.page += 1;
        },
        error: () => {
          this.errorMessage = 'No se pudieron cargar los canales.';
        }
      });
  }

  private clearSearchTimer(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private setChannelHealth(channelId: string, health: ChannelHealth): void {
    this.channelHealth.set(channelId, health);
    this.persistChannelHealth();
  }

  private restoreChannelHealth(): void {
    try {
      const rawState = localStorage.getItem(this.healthStorageKey);

      if (!rawState) {
        return;
      }

      const parsed = JSON.parse(rawState) as Record<string, ChannelHealth>;

      Object.entries(parsed).forEach(([channelId, health]) => {
        if (this.isChannelHealth(health)) {
          this.channelHealth.set(channelId, health);
        }
      });
    } catch {
      this.channelHealth.clear();
    }
  }

  private persistChannelHealth(): void {
    try {
      const serialized = JSON.stringify(Object.fromEntries(this.channelHealth));
      localStorage.setItem(this.healthStorageKey, serialized);
    } catch {
      // Local status is only a UX cache; API reporting still runs independently.
    }
  }

  private isChannelHealth(value: string): value is ChannelHealth {
    return value === 'healthy'
      || value === 'slow'
      || value === 'blocked'
      || value === 'reported'
      || value === 'unknown';
  }
}
