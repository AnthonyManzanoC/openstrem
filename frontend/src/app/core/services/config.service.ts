import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdsConfig } from '../models/ads-config.model';

const FALLBACK_AD_SCRIPT = "<script>console.log('Ad Placeholder');</script>";

const TEST_ADS_CONFIG: AdsConfig = {
  id: '',
  adScript: FALLBACK_AD_SCRIPT
};

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

  private normalizeConfig(config: Partial<AdsConfig> | null | undefined): AdsConfig {
    const adScript = this.clean(config?.adScript);
    const normalizedAdScript = adScript || TEST_ADS_CONFIG.adScript;
    const usesFallback = !adScript || normalizedAdScript === TEST_ADS_CONFIG.adScript;

    this.fallbackState.set(usesFallback);

    return {
      id: this.clean(config?.id),
      adScript: normalizedAdScript
    };
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
