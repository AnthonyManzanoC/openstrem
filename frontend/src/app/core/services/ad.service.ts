import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AdsConfig } from '../models/ads-config.model';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class AdService {
  private readonly appConfig = inject(ConfigService);
  private mobileAdsReady: Promise<void> | null = null;

  readonly webBannerVisible = signal(false);
  readonly config = this.appConfig.config;

  async loadConfig(): Promise<AdsConfig> {
    const config = await this.appConfig.load();

    if (Capacitor.isNativePlatform()) {
      await this.initializeMobileAds();
    } else {
      this.webBannerVisible.set(Boolean(config.webAdClient));
    }

    return config;
  }

  async showBanner(): Promise<void> {
    const config = await this.loadConfig();

    if (!Capacitor.isNativePlatform()) {
      this.webBannerVisible.set(Boolean(config.webAdClient));
      return;
    }

    if (!config.adMobBannerId) {
      return;
    }

    const admob = await import('@capacitor-community/admob');
    await admob.AdMob.showBanner({
      adId: config.adMobBannerId,
      adSize: admob.BannerAdSize.ADAPTIVE_BANNER,
      position: admob.BannerAdPosition.BOTTOM_CENTER
    });
  }

  async showInterstitial(): Promise<void> {
    const config = await this.loadConfig();

    if (!Capacitor.isNativePlatform() || !config.adMobInterstitialId) {
      return;
    }

    const admob = await import('@capacitor-community/admob');
    await admob.AdMob.prepareInterstitial({
      adId: config.adMobInterstitialId
    });
    await admob.AdMob.showInterstitial();
  }

  async hideBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.webBannerVisible.set(false);
      return;
    }

    const admob = await import('@capacitor-community/admob');
    await admob.AdMob.hideBanner();
  }

  private async initializeMobileAds(): Promise<void> {
    this.mobileAdsReady ??= import('@capacitor-community/admob').then((admob) =>
      admob.AdMob.initialize({
        initializeForTesting: this.appConfig.usingFallbackAds()
      })
    );

    await this.mobileAdsReady;
  }
}
