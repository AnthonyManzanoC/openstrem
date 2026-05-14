import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { FavoritesService } from '../../core/services/favorites.service';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss'
})
export class WelcomeComponent implements OnInit, OnDestroy {
  private readonly favorites = inject(FavoritesService);
  private readonly settings = inject(SettingsService);

  showSplash = true;
  splashLeaving = false;

  private splashTimer: ReturnType<typeof setTimeout> | null = null;
  private splashExitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.favorites.getClientId();

    const startPage = this.settings.preferences().startPage;

    if (startPage === 'home' || startPage === 'tv') {
      void this.router.navigate([`/${startPage}`], { replaceUrl: true });
      return;
    }

    this.splashTimer = setTimeout(() => {
      this.splashLeaving = true;
      this.splashExitTimer = setTimeout(() => {
        this.showSplash = false;
      }, 420);
    }, 2600);
  }

  ngOnDestroy(): void {
    this.clearSplashTimers();
  }

  goToHome(): void {
    void this.router.navigate(['/home']);
  }

  goToTv(): void {
    void this.router.navigate(['/tv']);
  }

  goToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  private clearSplashTimers(): void {
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }

    if (this.splashExitTimer) {
      clearTimeout(this.splashExitTimer);
      this.splashExitTimer = null;
    }
  }
}
