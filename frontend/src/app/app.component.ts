import { Component, NgZone, OnDestroy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { App as CapacitorApp, type BackButtonListenerEvent } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  archiveOutline,
  arrowForwardOutline,
  arrowBackOutline,
  chevronDownOutline,
  chevronUpOutline,
  closeOutline,
  ellipsisVertical,
  flagOutline,
  gridOutline,
  homeOutline,
  informationCircleOutline,
  languageOutline,
  linkOutline,
  lockClosedOutline,
  menuOutline,
  moonOutline,
  pauseCircleOutline,
  personCircleOutline,
  phoneLandscapeOutline,
  phonePortraitOutline,
  removeOutline,
  playCircleOutline,
  playOutline,
  refreshOutline,
  saveOutline,
  searchOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  star,
  starOutline,
  sunnyOutline,
  tvOutline,
  volumeHighOutline,
  warningOutline
} from 'ionicons/icons';
import { FavoritesService } from './core/services/favorites.service';
import { SettingsService } from './core/services/settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnDestroy {
  private backButtonListener?: PluginListenerHandle;

  constructor(
    favorites: FavoritesService,
    settings: SettingsService,
    private readonly router: Router,
    private readonly ngZone: NgZone
  ) {
    favorites.getClientId();
    settings.preferences();

    addIcons({
      addOutline,
      alertCircleOutline,
      archiveOutline,
      arrowForwardOutline,
      arrowBackOutline,
      chevronDownOutline,
      chevronUpOutline,
      closeOutline,
      ellipsisVertical,
      flagOutline,
      gridOutline,
      homeOutline,
      informationCircleOutline,
      languageOutline,
      linkOutline,
      lockClosedOutline,
      menuOutline,
      moonOutline,
      pauseCircleOutline,
      personCircleOutline,
      phoneLandscapeOutline,
      phonePortraitOutline,
      removeOutline,
      playCircleOutline,
      playOutline,
      refreshOutline,
      saveOutline,
      searchOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      star,
      starOutline,
      sunnyOutline,
      tvOutline,
      volumeHighOutline,
      warningOutline
    });

    void this.registerNativeBackButton();
  }

  ngOnDestroy(): void {
    void this.backButtonListener?.remove();
  }

  private async registerNativeBackButton(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      this.backButtonListener = await CapacitorApp.addListener(
        'backButton',
        (event: BackButtonListenerEvent) => {
          void this.handleNativeBackButton(event);
        }
      );
    } catch (error) {
      console.error('No se pudo registrar el boton atras nativo.', error);
    }
  }

  private async handleNativeBackButton(event: BackButtonListenerEvent): Promise<void> {
    if (this.isWelcomeRoute(this.router.url)) {
      await CapacitorApp.exitApp();
      return;
    }

    if (event.canGoBack) {
      this.ngZone.run(() => window.history.back());
      return;
    }

    this.ngZone.run(() => {
      void this.router.navigate(['/']);
    });
  }

  private isWelcomeRoute(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0] || '/';

    return path === '/' || path === '/welcome';
  }
}
