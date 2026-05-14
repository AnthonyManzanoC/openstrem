import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { FavoritesService } from '../../core/services/favorites.service';
import {
  AppLanguage,
  AppStartPage,
  AppTheme,
  SettingsService
} from '../../core/services/settings.service';

interface ChoiceOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private readonly settings = inject(SettingsService);
  private readonly favorites = inject(FavoritesService);

  readonly preferences = this.settings.preferences;
  readonly clientId = this.favorites.getClientId();
  readonly themeOptions: ChoiceOption<AppTheme>[] = [
    {
      value: 'dark',
      label: 'Oscuro',
      description: 'Cine, menos brillo y mas contraste.',
      icon: 'moon-outline'
    },
    {
      value: 'light',
      label: 'Claro',
      description: 'Blanco limpio para usar de dia.',
      icon: 'sunny-outline'
    }
  ];
  readonly startOptions: ChoiceOption<AppStartPage>[] = [
    {
      value: 'welcome',
      label: 'Bienvenida',
      description: 'Preguntar cada vez como quiere ver TV.',
      icon: 'home-outline'
    },
    {
      value: 'home',
      label: 'Catalogo',
      description: 'Abrir directo la grilla de canales.',
      icon: 'grid-outline'
    },
    {
      value: 'tv',
      label: 'Modo TV',
      description: 'Ideal para adultos mayores o control remoto.',
      icon: 'tv-outline'
    }
  ];
  readonly languageOptions: ChoiceOption<AppLanguage>[] = [
    {
      value: 'es',
      label: 'Espanol',
      description: 'Idioma principal de la interfaz.',
      icon: 'language-outline'
    },
    {
      value: 'en',
      label: 'English',
      description: 'Preferencia guardada para este cliente.',
      icon: 'language-outline'
    }
  ];

  constructor(private router: Router) {}

  goToWelcome(): void {
    void this.router.navigate(['/']);
  }

  setTheme(theme: AppTheme): void {
    this.settings.setTheme(theme);
  }

  setStartPage(startPage: AppStartPage): void {
    this.settings.setStartPage(startPage);
  }

  setLanguage(language: AppLanguage): void {
    this.settings.setLanguage(language);
  }

  togglePauseInBackground(): void {
    this.settings.setPauseInBackground(!this.preferences().pauseInBackground);
  }
}
