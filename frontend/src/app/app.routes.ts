import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/welcome/welcome.component').then((m) => m.WelcomeComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage)
  },
  {
    path: 'tv',
    loadComponent: () => import('./pages/tv-mode/tv-mode.component').then((m) => m.TvModeComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent)
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
