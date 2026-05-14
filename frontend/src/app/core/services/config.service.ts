import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdsConfig } from '../models/ads-config.model';

const TEST_ADS_CONFIG: AdsConfig = {
  id: '',
  adMobBannerId: 'ca-app-pub-3940256099942544/6300978111',
  adMobInterstitialId: 'ca-app-pub-3940256099942544/1033173712',
  webAdClient: 'ca-pub-3940256099942544'
};

export type AppRuntime = 'android' | 'ios' | 'capacitor' | 'electron' | 'web';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private readonly http = inject(HttpClient);
  private readonly configState = signal<AdsConfig>(TEST_ADS_CONFIG);
  private readonly loadedState = signal(false);
  private readonly fallbackState = signal(true);
  private loadPromise: Promise<AdsConfig> | null = null;

  readonly config = this.configState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly usingFallbackAds = this.fallbackState.asReadonly();

  load(): Promise<AdsConfig> {
    if (this.loadedState()) {
      return Promise.resolve(this.configState());
    }

    this.loadPromise ??= firstValueFrom(
      this.http.get<Partial<AdsConfig>>(`${environment.apiUrl}/config`).pipe(
        map((config) => this.normalizeConfig(config)),
        catchError(() => of(this.normalizeConfig({})))
      )
    ).then((config) => {
      this.configState.set(config);
      this.loadedState.set(true);
      return config;
    });

    return this.loadPromise;
  }

  getRuntime(): AppRuntime {
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();

      if (platform === 'android' || platform === 'ios') {
        return platform;
      }

      return 'capacitor';
    }

    if (typeof document !== 'undefined'
      && document.documentElement.dataset['platform'] === 'electron') {
      return 'electron';
    }

    if (typeof navigator !== 'undefined'
      && navigator.userAgent.toLowerCase().includes('electron')) {
      return 'electron';
    }

    return 'web';
  }

  isNativeMobile(): boolean {
    const runtime = this.getRuntime();
    return runtime === 'android' || runtime === 'ios' || runtime === 'capacitor';
  }

  private normalizeConfig(config: Partial<AdsConfig> | null | undefined): AdsConfig {
    const adMobBannerId = this.clean(config?.adMobBannerId);
    const adMobInterstitialId = this.clean(config?.adMobInterstitialId);
    const webAdClient = this.clean(config?.webAdClient);
    const usesFallback = !adMobBannerId || !adMobInterstitialId || !webAdClient;

    this.fallbackState.set(usesFallback);

    return {
      id: this.clean(config?.id),
      adMobBannerId: adMobBannerId || TEST_ADS_CONFIG.adMobBannerId,
      adMobInterstitialId: adMobInterstitialId || TEST_ADS_CONFIG.adMobInterstitialId,
      webAdClient: webAdClient || TEST_ADS_CONFIG.webAdClient
    };
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
