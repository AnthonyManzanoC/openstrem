import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';
import { finalize } from 'rxjs';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import { environment } from '../../../environments/environment';
import { ChannelRepairResponse } from '../../core/models/channel.model';
import { ApiService } from '../../core/services/api.service';
import { SettingsService } from '../../core/services/settings.service';

export type PlayerPlaybackStatus = 'online' | 'slow' | 'failed';
export type PlayerPresentation = 'overlay' | 'inline';

interface PlayerTrackOption {
  id: string;
  label: string;
  language: string;
  active: boolean;
}

interface VideoJsAudioTrack {
  id?: string;
  label?: string;
  language?: string;
  enabled?: boolean;
}

interface VideoJsAudioTrackList {
  readonly length: number;
  item?: (index: number) => VideoJsAudioTrack | null;
}

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonSpinner],
  templateUrl: './player.component.html',
  styleUrl: './player.component.scss'
})
export class PlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) channelId = '';
  @Input({ required: true }) streamUrl = '';
  @Input({ required: true }) title = '';
  @Input() presentation: PlayerPresentation = 'overlay';
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly playbackStatus = new EventEmitter<PlayerPlaybackStatus>();
  @Output() readonly playbackReport = new EventEmitter<string>();
  @Output() readonly playbackRepaired = new EventEmitter<ChannelRepairResponse>();
  @Output() readonly pipModeChanged = new EventEmitter<boolean>();
  @ViewChild('videoTarget', { static: true }) videoTarget!: ElementRef<HTMLVideoElement>;

  loadingTimedOut = false;
  playbackError = false;
  buffering = true;
  isPipActive = false;
  reportSent = false;
  repairing = false;
  settingsOpen = false;
  audioTracks: PlayerTrackOption[] = [];
  textTracks: PlayerTrackOption[] = [];
  selectedAudioTrackId = '';
  selectedTextTrackId = 'off';

  private player: Player | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private errorGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmittedStatus: PlayerPlaybackStatus | null = null;
  private wasPlayingBeforeHidden = false;
  private readonly trackRefreshTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly proxyStreamEndpoint = `${environment.apiUrl.replace(/\/+$/, '')}/proxy/stream`;

  @HostBinding('class.inline-player')
  get inlinePlayer(): boolean {
    return this.presentation === 'inline';
  }

  @HostBinding('class.pip-active')
  get pipActiveHost(): boolean {
    return this.isPipActive;
  }

  constructor(
    private readonly api: ApiService,
    private readonly settings: SettingsService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly toastController: ToastController
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['streamUrl']
      && !changes['streamUrl'].firstChange
      && this.player
      && !this.player.isDisposed()
    ) {
      this.applyStreamUrl(this.streamUrl);
    }
  }

  ngAfterViewInit(): void {
    const initialStreamUrl = this.resolvePlayableStreamUrl(this.streamUrl);

    this.player = videojs(this.videoTarget.nativeElement, {
      autoplay: true,
      controls: true,
      fill: true,
      fluid: false,
      liveui: true,
      preload: 'auto',
      responsive: true,
      html5: {
        vhs: {
          overrideNative: true
        },
        nativeAudioTracks: false,
        nativeTextTracks: false
      },
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'liveDisplay',
          'progressControl',
          'remainingTimeDisplay',
          'subsCapsButton',
          'audioTrackButton',
          'pictureInPictureToggle',
          'fullscreenToggle'
        ]
      },
      sources: [
        {
          src: initialStreamUrl,
          type: 'application/x-mpegURL'
        }
      ]
    });

    this.bindPlayerEvents();
    this.bindVisibilityEvents();
    this.startLoadTimer();

    this.player.ready(() => {
      this.refreshTracks();
      this.scheduleTrackRefresh(600);
      this.scheduleTrackRefresh(1800);

      void this.videoTarget.nativeElement.play().catch(() => undefined);

      try {
        if (this.presentation === 'overlay' && this.player?.requestFullscreen) {
          this.player.requestFullscreen();
        }
      } catch {
        // Fullscreen can be blocked without a user gesture; playback should continue.
      }
    });
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
  }

  selectTextTrack(trackId: string): void {
    const tracks = this.getTextTrackList();

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      const id = this.getTextTrackId(track, index);

      if (track.kind === 'subtitles' || track.kind === 'captions') {
        track.mode = id === trackId ? 'showing' : 'disabled';
      }
    }

    this.selectedTextTrackId = trackId;
    this.refreshTracks();
  }

  selectAudioTrack(trackId: string): void {
    const tracks = this.getAudioTrackList();

    if (!tracks) {
      return;
    }

    for (let index = 0; index < tracks.length; index += 1) {
      const track = this.getAudioTrackAt(tracks, index);

      if (!track) {
        continue;
      }

      track.enabled = this.getAudioTrackId(track, index) === trackId;
    }

    this.selectedAudioTrackId = trackId;
    this.refreshTracks();
  }

  reportIssue(): void {
    if (this.repairing || this.reportSent) {
      return;
    }

    this.forcePipBackToDom();

    const reason = this.loadingTimedOut ? 'load-timeout' : 'playback-error';
    this.repairing = true;

    this.api.reportAndHealChannel(this.channelId, {
      status: 'reported',
      reason
    })
      .pipe(finalize(() => {
        this.repairing = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          if (response.repaired && response.streamUrl) {
            this.playbackRepaired.emit(response);
            this.applyStreamUrl(response.streamUrl);
            return;
          }

          this.reportSent = true;
          this.playbackReport.emit(reason);
        },
        error: () => {
          this.reportSent = true;
          this.playbackReport.emit(reason);
        }
      });
  }

  reportManualIssue(): void {
    if (this.repairing || this.reportSent) {
      return;
    }

    this.forcePipBackToDom();
    this.repairing = true;
    this.reportSent = true;

    this.api.reportChannelPlayback(this.channelId, {
      status: 'reported',
      reason: 'manual-bypass'
    })
      .subscribe({
        error: () => {
          this.reportSent = false;
        }
      });

    this.playbackReport.emit('manual-bypass');
    void this.presentToast('Canal enviado a revision a clinica');
    this.close();
  }

  changeVolume(delta: number): number {
    if (!this.player || this.player.isDisposed()) {
      return 0;
    }

    const currentVolume = this.player.volume() ?? 1;
    const nextVolume = Math.max(0, Math.min(1, currentVolume + delta));
    this.player.volume(nextVolume);
    this.player.muted(false);

    return Math.round(nextVolume * 100);
  }

  reloadStream(): void {
    if (!this.player || this.player.isDisposed()) {
      return;
    }

    const currentSource = this.player.currentSource() as { src?: string; type?: string } | null;
    const currentSrc = this.resolvePlayableStreamUrl(
      currentSource?.src || this.player.currentSrc() || this.streamUrl
    );

    if (!currentSrc) {
      return;
    }

    this.buffering = true;
    this.loadingTimedOut = false;
    this.playbackError = false;
    this.reportSent = false;
    this.settingsOpen = false;
    this.clearLoadTimer();
    this.clearErrorGraceTimer();
    this.startLoadTimer();

    this.player.src({
      src: currentSrc,
      type: currentSource?.type || 'application/x-mpegURL'
    });
    this.player.load();

    const playAttempt = this.player.play();

    if (playAttempt && typeof playAttempt.catch === 'function') {
      void playAttempt.catch(() => undefined);
    }
  }

  close(): void {
    this.dispose();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  private dispose(): void {
    this.clearLoadTimer();
    this.clearErrorGraceTimer();
    this.clearTrackRefreshTimers();
    this.forcePipBackToDom();

    if (this.isPipActive) {
      this.setPipActive(false);
    }

    this.unbindNativePipEvents();
    this.unbindVisibilityEvents();

    if (this.player && !this.player.isDisposed()) {
      this.player.dispose();
    }

    this.player = null;
  }

  private bindPlayerEvents(): void {
    if (!this.player) {
      return;
    }

    this.bindNativePipEvents();

    this.player.on('loadedmetadata', () => {
      this.runInAngular(() => {
        this.markOnline();
        this.refreshTracks();
        this.scheduleTrackRefresh(700);
      });
    });

    this.player.on('canplay', () => this.runInAngular(() => this.markOnline()));
    this.player.on('playing', () => this.runInAngular(() => this.markOnline()));

    this.player.on('waiting', () => {
      this.runInAngular(() => {
        this.buffering = true;
      });
    });

    this.player.on('stalled', () => {
      this.runInAngular(() => {
        this.buffering = true;
      });
    });

    this.player.on('error', () => {
      this.runInAngular(() => this.handlePlaybackError());
    });

    this.player.on('enterpictureinpicture', () => {
      this.runInAngular(() => this.setPipActive(true));
    });

    this.player.on('leavepictureinpicture', () => {
      this.runInAngular(() => this.setPipActive(false));
    });
  }

  private startLoadTimer(): void {
    this.clearLoadTimer();
    this.loadTimer = setTimeout(() => {
      this.runInAngular(() => {
        if (!this.player?.isDisposed() && this.buffering) {
          this.forcePipBackToDom();
          this.loadingTimedOut = true;
          this.playbackError = false;
          this.emitStatus('slow');
        }
      });
    }, 10000);
  }

  private markOnline(): void {
    this.buffering = false;
    this.loadingTimedOut = false;
    this.playbackError = false;
    this.reportSent = false;
    this.clearLoadTimer();
    this.clearErrorGraceTimer();
    this.emitStatus('online');
  }

  private handlePlaybackError(): void {
    this.buffering = true;
    this.loadingTimedOut = false;
    this.playbackError = false;
    this.clearLoadTimer();
    this.startErrorGraceTimer();
  }

  private startErrorGraceTimer(): void {
    this.clearErrorGraceTimer();
    this.errorGraceTimer = setTimeout(() => {
      this.runInAngular(() => this.confirmPlaybackError());
    }, 10000);
  }

  private confirmPlaybackError(): void {
    if (!this.player || this.player.isDisposed() || !this.buffering) {
      return;
    }

    this.forcePipBackToDom();
    this.buffering = false;
    this.loadingTimedOut = false;
    this.playbackError = true;
    this.clearErrorGraceTimer();
    this.emitStatus('failed');
  }

  private applyStreamUrl(streamUrl: string): void {
    this.streamUrl = streamUrl;
    const playableStreamUrl = this.resolvePlayableStreamUrl(streamUrl);

    this.buffering = true;
    this.loadingTimedOut = false;
    this.playbackError = false;
    this.reportSent = false;
    this.clearLoadTimer();
    this.clearErrorGraceTimer();
    this.startLoadTimer();

    if (!this.player || this.player.isDisposed()) {
      return;
    }

    this.player.src({
      src: playableStreamUrl,
      type: 'application/x-mpegURL'
    });
    this.player.load();

    const playAttempt = this.player.play();

    if (playAttempt && typeof playAttempt.catch === 'function') {
      void playAttempt.catch(() => undefined);
    }
  }

  private resolvePlayableStreamUrl(streamUrl: string): string {
    const normalizedStreamUrl = streamUrl.trim();

    if (!normalizedStreamUrl || this.isSecureHttpUrl(normalizedStreamUrl)) {
      return normalizedStreamUrl;
    }

    return `${this.proxyStreamEndpoint}?url=${encodeURIComponent(normalizedStreamUrl)}`;
  }

  private isSecureHttpUrl(streamUrl: string): boolean {
    try {
      return new URL(streamUrl).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private emitStatus(status: PlayerPlaybackStatus): void {
    if (this.lastEmittedStatus === status) {
      return;
    }

    this.lastEmittedStatus = status;
    this.playbackStatus.emit(status);
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'bottom',
      color: 'dark',
      cssClass: 'openstream-toast'
    });

    await toast.present();
  }

  private bindNativePipEvents(): void {
    const video = this.videoTarget.nativeElement;
    video.addEventListener('enterpictureinpicture', this.handleEnterPictureInPicture);
    video.addEventListener('leavepictureinpicture', this.handleLeavePictureInPicture);
  }

  private unbindNativePipEvents(): void {
    const video = this.videoTarget?.nativeElement;

    if (!video) {
      return;
    }

    video.removeEventListener('enterpictureinpicture', this.handleEnterPictureInPicture);
    video.removeEventListener('leavepictureinpicture', this.handleLeavePictureInPicture);
  }

  private bindVisibilityEvents(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private unbindVisibilityEvents(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private readonly handleEnterPictureInPicture = (): void => {
    this.runInAngular(() => this.setPipActive(true));
  };

  private readonly handleLeavePictureInPicture = (): void => {
    this.runInAngular(() => this.setPipActive(false));
  };

  private readonly handleVisibilityChange = (): void => {
    if (!this.settings.getPauseInBackground() || !this.player || this.player.isDisposed()) {
      return;
    }

    if (document.hidden) {
      this.wasPlayingBeforeHidden = !this.player.paused();
      this.player.pause();
      return;
    }

    if (!this.wasPlayingBeforeHidden) {
      return;
    }

    this.wasPlayingBeforeHidden = false;
    const playAttempt = this.player.play();

    if (playAttempt && typeof playAttempt.catch === 'function') {
      void playAttempt.catch(() => undefined);
    }
  };

  private setPipActive(active: boolean): void {
    if (this.isPipActive === active) {
      return;
    }

    this.isPipActive = active;
    this.pipModeChanged.emit(active);
  }

  private forcePipBackToDom(): void {
    this.exitNativePictureInPicture();

    if (this.isPipActive) {
      this.setPipActive(false);
    }
  }

  private exitNativePictureInPicture(): void {
    if (typeof document === 'undefined' || !document.pictureInPictureElement) {
      return;
    }

    void document.exitPictureInPicture().catch((error: unknown) => console.error(error));
  }

  private refreshTracks(): void {
    this.refreshTextTracks();
    this.refreshAudioTracks();
    this.cdr.markForCheck();
  }

  private refreshTextTracks(): void {
    const tracks = this.getTextTrackList();
    const options: PlayerTrackOption[] = [];
    let selectedId = 'off';

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];

      if (track.kind !== 'subtitles' && track.kind !== 'captions') {
        continue;
      }

      const id = this.getTextTrackId(track, index);

      if (track.mode === 'showing') {
        selectedId = id;
      }

      options.push({
        id,
        label: track.label || track.language || `Subtitulo ${index + 1}`,
        language: track.language || 'auto',
        active: track.mode === 'showing'
      });
    }

    this.textTracks = options;
    this.selectedTextTrackId = selectedId;
  }

  private refreshAudioTracks(): void {
    const tracks = this.getAudioTrackList();
    const options: PlayerTrackOption[] = [];
    let selectedId = '';

    if (!tracks) {
      this.audioTracks = [];
      this.selectedAudioTrackId = '';
      return;
    }

    for (let index = 0; index < tracks.length; index += 1) {
      const track = this.getAudioTrackAt(tracks, index);

      if (!track) {
        continue;
      }

      const id = this.getAudioTrackId(track, index);

      if (track.enabled) {
        selectedId = id;
      }

      options.push({
        id,
        label: track.label || track.language || `Audio ${index + 1}`,
        language: track.language || 'auto',
        active: Boolean(track.enabled)
      });
    }

    this.audioTracks = options;
    this.selectedAudioTrackId = selectedId;
  }

  private getTextTrackList(): TextTrackList {
    return this.videoTarget.nativeElement.textTracks;
  }

  private getAudioTrackList(): VideoJsAudioTrackList | null {
    const playerWithAudioTracks = this.player as (Player & {
      audioTracks?: () => VideoJsAudioTrackList;
    }) | null;

    return (playerWithAudioTracks?.audioTracks?.() as VideoJsAudioTrackList | undefined) ?? null;
  }

  private getTextTrackId(track: TextTrack, index: number): string {
    return track.id || `${track.kind}-${track.language || 'auto'}-${index}`;
  }

  private getAudioTrackId(track: VideoJsAudioTrack, index: number): string {
    return track.id || `${track.language || 'auto'}-${index}`;
  }

  private getAudioTrackAt(
    tracks: VideoJsAudioTrackList,
    index: number
  ): VideoJsAudioTrack | null {
    const indexedTrack = (tracks as unknown as Record<number, VideoJsAudioTrack | undefined>)[index];
    return indexedTrack ?? tracks.item?.(index) ?? null;
  }

  private scheduleTrackRefresh(delay: number): void {
    const timer = setTimeout(() => {
      this.runInAngular(() => this.refreshTracks());
    }, delay);

    this.trackRefreshTimers.push(timer);
  }

  private clearLoadTimer(): void {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private clearErrorGraceTimer(): void {
    if (this.errorGraceTimer) {
      clearTimeout(this.errorGraceTimer);
      this.errorGraceTimer = null;
    }
  }

  private clearTrackRefreshTimers(): void {
    while (this.trackRefreshTimers.length > 0) {
      const timer = this.trackRefreshTimers.pop();

      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private runInAngular(action: () => void): void {
    this.zone.run(() => {
      action();
      this.cdr.markForCheck();
    });
  }
}
