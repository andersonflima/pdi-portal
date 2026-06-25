import { Component, OnInit, inject } from '@angular/core';
import { LoginScreenComponent } from './features/auth/login-screen.component';
import { AuthService } from './core/auth/auth.service';
import { ToastComponent } from './core/notifications/toast.component';
import { ThemeService } from './core/theme/theme.service';
import { WorkspaceComponent } from './features/workspace/workspace.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginScreenComponent, WorkspaceComponent, ToastComponent],
  template: `
    @if (auth.isBootstrapping()) {
      <div class="boot" role="status" aria-live="polite" aria-busy="true">
        <span class="boot-spinner" aria-hidden="true"></span>
        <span>Loading workspace</span>
      </div>
    } @else if (auth.user(); as user) {
      <app-workspace [user]="user" />
    } @else {
      <app-login-screen />
    }

    <app-toast />
  `,
  styles: [
    `
      .boot {
        gap: 12px;
      }

      .boot-spinner {
        animation: boot-spin 720ms linear infinite;
        border: 2px solid color-mix(in srgb, var(--color-content-muted) 35%, transparent);
        border-radius: 50%;
        border-top-color: var(--color-action-primary);
        display: inline-block;
        height: 22px;
        width: 22px;
      }

      @keyframes boot-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .boot-spinner {
          animation-duration: 1800ms;
        }
      }
    `
  ]
})
export class AppComponent implements OnInit {
  protected readonly auth = inject(AuthService);

  constructor() {
    // Instantiate the theme service so the persisted theme is applied at startup.
    inject(ThemeService);
  }

  ngOnInit() {
    void this.auth.bootstrap();
  }
}
