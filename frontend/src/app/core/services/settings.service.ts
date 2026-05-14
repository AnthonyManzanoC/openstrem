import { Injectable, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';
export type AppStartPage = 'welcome' | 'home' | 'tv';
export type AppLanguage = 'es' | 'en';

export interface SettingsPreferences {
  theme: AppTheme;
  startPage: AppStartPage;
  pauseInBackground: boolean;
  language: AppLanguage;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly storageKey = 'openstream.settings.v1';
  private readonly defaults: SettingsPreferences = {
    theme: 'dark',
    startPage: 'welcome',
    pauseInBackground: false,
    language: 'es'
  };
  private readonly preferencesSignal = signal<SettingsPreferences>(this.readPreferences());

  readonly preferences = this.preferencesSignal.asReadonly();

  constructor() {
    this.applyDocumentPreferences(this.preferencesSignal());
  }

  setTheme(theme: AppTheme): void {
    this.updatePreferences({ theme });
  }

  setStartPage(startPage: AppStartPage): void {
    this.updatePreferences({ startPage });
  }

  setPauseInBackground(pauseInBackground: boolean): void {
    this.updatePreferences({ pauseInBackground });
  }

  setLanguage(language: AppLanguage): void {
    this.updatePreferences({ language });
  }

  getPauseInBackground(): boolean {
    return this.preferencesSignal().pauseInBackground;
  }

  private updatePreferences(patch: Partial<SettingsPreferences>): void {
    const nextPreferences: SettingsPreferences = {
      ...this.preferencesSignal(),
      ...patch
    };

    this.preferencesSignal.set(nextPreferences);
    this.writePreferences(nextPreferences);
    this.applyDocumentPreferences(nextPreferences);
  }

  private readPreferences(): SettingsPreferences {
    try {
      const rawPreferences = localStorage.getItem(this.storageKey);

      if (!rawPreferences) {
        return this.defaults;
      }

      const parsed = JSON.parse(rawPreferences) as Partial<SettingsPreferences>;

      return {
        theme: this.isTheme(parsed.theme) ? parsed.theme : this.defaults.theme,
        startPage: this.isStartPage(parsed.startPage) ? parsed.startPage : this.defaults.startPage,
        pauseInBackground: typeof parsed.pauseInBackground === 'boolean'
          ? parsed.pauseInBackground
          : this.defaults.pauseInBackground,
        language: this.isLanguage(parsed.language) ? parsed.language : this.defaults.language
      };
    } catch {
      return this.defaults;
    }
  }

  private writePreferences(preferences: SettingsPreferences): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(preferences));
    } catch {
      // Settings stay alive in memory if storage is blocked by the browser.
    }
  }

  private applyDocumentPreferences(preferences: SettingsPreferences): void {
    try {
      document.body.classList.toggle('light-theme', preferences.theme === 'light');
      document.documentElement.lang = preferences.language;
      document.documentElement.dataset['theme'] = preferences.theme;
    } catch {
      // The app is browser-first, but tests/builds should not fail without document.
    }
  }

  private isTheme(value: unknown): value is AppTheme {
    return value === 'dark' || value === 'light';
  }

  private isStartPage(value: unknown): value is AppStartPage {
    return value === 'welcome' || value === 'home' || value === 'tv';
  }

  private isLanguage(value: unknown): value is AppLanguage {
    return value === 'es' || value === 'en';
  }
}
