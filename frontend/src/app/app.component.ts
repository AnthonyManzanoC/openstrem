import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
export class AppComponent {
  constructor(favorites: FavoritesService, settings: SettingsService) {
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
  }
}
