import { Injectable, inject, signal } from '@angular/core';
import { AdsConfig } from '../models/ads-config.model';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class AdService {
  private readonly appConfig = inject(ConfigService);

  readonly webBannerVisible = signal(false);
  readonly config = this.appConfig.config;

  async loadConfig(): Promise<AdsConfig> {
    const config = await this.appConfig.load();

    this.webBannerVisible.set(Boolean(config.adScript));
    return config;
  }

  async showBanner(): Promise<void> {
    const config = await this.loadConfig();

    this.webBannerVisible.set(Boolean(config.adScript));
  }

  async showInterstitial(): Promise<void> {
    return;
  }

  async hideBanner(): Promise<void> {
    this.webBannerVisible.set(false);
  }
}
