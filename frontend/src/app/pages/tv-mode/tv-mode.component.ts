import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  ScreenOrientation as CapacitorScreenOrientation,
  type OrientationLockType
} from '@capacitor/screen-orientation';
import {
  IonContent,
  IonIcon,
  IonSpinner
} from '@ionic/angular/standalone';
import { LazyLogoDirective } from '../../core/directives/lazy-logo.directive';
import { Channel, ChannelRepairResponse } from '../../core/models/channel.model';
import { ApiService } from '../../core/services/api.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import {
  PlayerComponent,
  PlayerPlaybackStatus
} from '../../shared/player/player.component';

type TvSignalState = 'online' | 'slow' | 'failed' | 'idle';
type TvOrientationMode = 'landscape' | 'portrait';
type WebScreenOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

@Component({
  selector: 'app-tv-mode',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSpinner,
    LazyLogoDirective,
    PlayerComponent,
    AdBannerComponent
  ],
  templateUrl: './tv-mode.component.html',
  styleUrl: './tv-mode.component.scss'
})
export class TvModeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly favorites = inject(FavoritesService);

  @ViewChild(PlayerComponent) player?: PlayerComponent;

  favoriteChannels: Channel[] = [];
  selectedChannel: Channel | null = null;
  loading = false;
  errorMessage = '';
  signalState: TvSignalState = 'idle';
  volumeLevel = 100;
  isMenuVisible = true;
  isLocked = false;
  isPipActive = false;
  toastMessage = '';
  orientationMode: TvOrientationMode = 'landscape';
  isViewportPortrait = false;
  showRotateHint = false;

  private readonly pageSize = 100;
  private readonly rotateHintMs = 4600;
  private readonly logoFailureIds = new Set<string>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateHintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.favorites.getClientId();
    this.bindViewportOrientation();
    void this.applyOrientationMode('landscape', true);
    this.loadTvChannels();
  }

  ngOnDestroy(): void {
    this.clearToastTimer();
    this.clearRotateHintTimer();
    this.unbindViewportOrientation();
    void this.restorePortraitOrientation();
    this.exitPictureInPicture();
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

  @HostListener('document:keydown', ['$event'])
  handleRemoteControl(event: KeyboardEvent): void {
    if (this.shouldIgnoreRemoteKey(event)) {
      return;
    }

    let handled = true;

    switch (event.key) {
      case 'ArrowUp':
        this.nextChannel();
        break;
      case 'ArrowDown':
        this.previousChannel();
        break;
      case 'ArrowRight':
        this.changeVolume(0.1);
        break;
      case 'ArrowLeft':
        this.changeVolume(-0.1);
        break;
      case 'Enter':
        if (this.isLocked) {
          this.toggleLock();
        } else {
          this.toggleMenu();
        }
        break;
      case ' ':
      case 'Space':
      case 'Spacebar':
        this.toggleLock();
        break;
      default:
        handled = false;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  toggleMenu(): void {
    if (this.isLocked) {
      return;
    }

    if (this.isPipActive) {
      this.isMenuVisible = true;
      return;
    }

    this.isMenuVisible = !this.isMenuVisible;
  }

  toggleLock(): void {
    this.isLocked = !this.isLocked;

    if (this.isLocked) {
      this.isMenuVisible = false;
    }
  }

  selectChannel(channel: Channel, collapseMenu = false): void {
    if (this.selectedChannel?.id !== channel.id) {
      this.selectedChannel = channel;
      this.signalState = 'idle';
    }

    if (collapseMenu && !this.isPipActive) {
      this.isMenuVisible = false;
    }
  }

  nextChannel(): void {
    this.navigateChannel(1);
  }

  previousChannel(): void {
    this.navigateChannel(-1);
  }

  get orientationButtonLabel(): string {
    return this.orientationMode === 'landscape'
      ? 'Cambiar a vertical'
      : 'Cambiar a horizontal';
  }

  get orientationButtonIcon(): string {
    return this.orientationMode === 'landscape'
      ? 'phone-portrait-outline'
      : 'phone-landscape-outline';
  }

  toggleOrientationMode(): void {
    const nextMode: TvOrientationMode = this.orientationMode === 'landscape'
      ? 'portrait'
      : 'landscape';

    void this.applyOrientationMode(nextMode, false);
  }

  changeVolume(delta: number): void {
    const nextVolume = this.player?.changeVolume(delta);

    if (typeof nextVolume === 'number') {
      this.volumeLevel = nextVolume;
    }
  }

  reportSelectedChannel(): void {
    this.player?.reportIssue();
  }

  reloadSelectedStream(): void {
    if (!this.player) {
      return;
    }

    this.signalState = 'idle';
    this.player.reloadStream();
    this.showToast('Recargando senal en vivo');
  }

  async shareSelectedChannel(): Promise<void> {
    const channel = this.selectedChannel;

    if (!channel) {
      return;
    }

    try {
      await this.writeClipboard(`${channel.name}\n${channel.streamUrl}`);
      this.showToast('Enlace copiado al portapapeles');
    } catch {
      this.showToast('No se pudo copiar el enlace');
    }
  }

  handlePlaybackStatus(status: PlayerPlaybackStatus): void {
    this.signalState = status;
  }

  handlePlaybackReport(): void {
    this.signalState = 'failed';
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
    this.favoriteChannels = this.favoriteChannels.map((item) =>
      item.id === channel.id ? updatedChannel : item
    );
    this.signalState = response.repaired ? 'online' : 'failed';
  }

  handlePipModeChanged(active: boolean): void {
    this.isPipActive = active;

    if (active) {
      this.isLocked = false;
      this.isMenuVisible = true;
    }
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

  trackByChannelId(_: number, channel: Channel): string {
    return channel.id;
  }

  private loadTvChannels(): void {
    this.loading = true;
    this.errorMessage = '';
    this.favoriteChannels = [];
    this.selectedChannel = null;
    this.loadTvChannelsPage(1, [], this.favorites.getAddedChannelIds());
  }

  private navigateChannel(direction: 1 | -1): void {
    if (this.favoriteChannels.length === 0) {
      return;
    }

    const currentIndex = this.selectedChannel
      ? this.favoriteChannels.findIndex((channel) => channel.id === this.selectedChannel?.id)
      : -1;

    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : this.favoriteChannels.length - 1)
      : (currentIndex + direction + this.favoriteChannels.length) % this.favoriteChannels.length;

    this.selectChannel(this.favoriteChannels[nextIndex]);
  }

  private loadTvChannelsPage(page: number, collectedChannels: Channel[], addedChannelIds: string[]): void {
    this.api.getChannels({
      page,
      pageSize: this.pageSize,
      showInTvMode: true
    }).subscribe({
      next: (result) => {
        const mergedChannels = [...collectedChannels, ...result.items];

        if (result.hasMore) {
          this.loadTvChannelsPage(page + 1, mergedChannels, addedChannelIds);
          return;
        }

        this.loadAddedChannelsPage(1, [], mergedChannels, addedChannelIds);
      },
      error: () => {
        this.finishTvChannelsLoad(this.favorites.getMergedChannels([]), true);
      }
    });
  }

  private loadAddedChannelsPage(
    page: number,
    collectedAddedChannels: Channel[],
    defaultChannels: Channel[],
    addedChannelIds: string[]
  ): void {
    if (addedChannelIds.length === 0) {
      this.finishTvChannelsLoad(this.favorites.getMergedChannels(defaultChannels));
      return;
    }

    this.api.getChannels({
      ids: addedChannelIds,
      page,
      pageSize: this.pageSize
    }).subscribe({
      next: (result) => {
        const mergedAddedChannels = [...collectedAddedChannels, ...result.items];

        if (result.hasMore) {
          this.loadAddedChannelsPage(page + 1, mergedAddedChannels, defaultChannels, addedChannelIds);
          return;
        }

        this.finishTvChannelsLoad(this.favorites.getMergedChannels([
          ...defaultChannels,
          ...mergedAddedChannels
        ]));
      },
      error: () => {
        this.finishTvChannelsLoad(this.favorites.getMergedChannels(defaultChannels), false);
      }
    });
  }

  private finishTvChannelsLoad(tvChannels: Channel[], isDefaultLoadError = false): void {
    this.favoriteChannels = tvChannels;
    this.selectedChannel = tvChannels[0] ?? null;
    this.loading = false;

    if (tvChannels.length > 0) {
      this.errorMessage = '';
      return;
    }

    if (isDefaultLoadError) {
      this.errorMessage = 'No se pudieron cargar los canales fijados.';
    }
  }

  private async writeClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    this.copyWithTextarea(text);
  }

  private copyWithTextarea(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const copied = document.execCommand('copy');

      if (!copied) {
        throw new Error('Clipboard copy rejected');
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    this.clearToastTimer();
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
      this.toastTimer = null;
    }, 2200);
  }

  private clearToastTimer(): void {
    if (!this.toastTimer) {
      return;
    }

    clearTimeout(this.toastTimer);
    this.toastTimer = null;
  }

  private async applyOrientationMode(mode: TvOrientationMode, automatic: boolean): Promise<void> {
    this.orientationMode = mode;
    this.updateViewportOrientationState();
    this.showRotateHint = false;
    this.clearRotateHintTimer();

    try {
      await this.lockOrientation(mode);

      if (!automatic) {
        this.showToast(mode === 'landscape' ? 'Modo horizontal activado' : 'Modo vertical activado');
      }
    } catch {
      if (mode === 'landscape' && this.isViewportPortrait) {
        this.showRotateHint = true;
        this.rotateHintTimer = setTimeout(() => {
          this.showRotateHint = false;
          this.rotateHintTimer = null;
        }, this.rotateHintMs);
      }

      if (!automatic) {
        this.showToast(mode === 'landscape'
          ? 'Voltea tu telefono para modo horizontal'
          : 'Modo vertical activado');
      }
    }
  }

  private async restorePortraitOrientation(): Promise<void> {
    this.orientationMode = 'portrait';
    this.showRotateHint = false;

    try {
      await this.unlockOrientation();
    } catch {
      // Some browsers only allow orientation changes after a user gesture.
    }

    try {
      await this.lockOrientation('portrait');
    } catch {
      // Keeping the menu usable matters more than forcing unsupported web APIs.
    }
  }

  private async lockOrientation(mode: TvOrientationMode): Promise<void> {
    const orientation = mode === 'landscape' ? 'landscape' : 'portrait-primary';

    if (Capacitor.isNativePlatform()) {
      await CapacitorScreenOrientation.lock({ orientation });
      return;
    }

    await this.lockWebOrientation(orientation);
  }

  private async unlockOrientation(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await CapacitorScreenOrientation.unlock();
      return;
    }

    const screenOrientation = this.getWebScreenOrientation();
    screenOrientation?.unlock?.();
  }

  private async lockWebOrientation(orientation: OrientationLockType): Promise<void> {
    const screenOrientation = this.getWebScreenOrientation();

    if (!screenOrientation?.lock) {
      throw new Error('Screen Orientation API is not available');
    }

    await screenOrientation.lock(orientation);
  }

  private getWebScreenOrientation(): WebScreenOrientation | null {
    if (typeof screen === 'undefined' || !screen.orientation) {
      return null;
    }

    return screen.orientation as WebScreenOrientation;
  }

  private bindViewportOrientation(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.updateViewportOrientationState();
    window.addEventListener('resize', this.handleViewportOrientationChange, { passive: true });
    window.addEventListener('orientationchange', this.handleViewportOrientationChange, { passive: true });
  }

  private unbindViewportOrientation(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.removeEventListener('resize', this.handleViewportOrientationChange);
    window.removeEventListener('orientationchange', this.handleViewportOrientationChange);
  }

  private updateViewportOrientationState(): void {
    if (typeof window === 'undefined') {
      this.isViewportPortrait = false;
      return;
    }

    this.isViewportPortrait = window.matchMedia?.('(orientation: portrait)').matches
      ?? window.innerHeight >= window.innerWidth;
  }

  private clearRotateHintTimer(): void {
    if (!this.rotateHintTimer) {
      return;
    }

    clearTimeout(this.rotateHintTimer);
    this.rotateHintTimer = null;
  }

  private readonly handleViewportOrientationChange = (): void => {
    this.updateViewportOrientationState();

    if (this.orientationMode === 'landscape' && !this.isViewportPortrait) {
      this.showRotateHint = false;
      this.clearRotateHintTimer();
    }
  };

  private shouldIgnoreRemoteKey(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return true;
    }

    const target = event.target as HTMLElement | null;

    if (!target) {
      return false;
    }

    return target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT'
      || target.isContentEditable;
  }

  private exitPictureInPicture(): void {
    if (typeof document === 'undefined' || !document.pictureInPictureElement) {
      return;
    }

    void document.exitPictureInPicture().catch((error: unknown) => console.error(error));
  }
}
