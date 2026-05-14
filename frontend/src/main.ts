import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({
      mode: 'md'
    }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptorsFromDi()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch((error) => console.error(error));
