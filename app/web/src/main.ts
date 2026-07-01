import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AppComponent } from './app/app.component';
import { appLucideIcons } from './app/shared/lucide-icons';

bootstrapApplication(AppComponent, {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), importProvidersFrom(LucideAngularModule.pick(appLucideIcons))]
}).catch((error: unknown) => {
  console.error(error);
});
