import { Component, OnInit, inject } from '@angular/core';
import { LoginScreenComponent } from './features/auth/login-screen.component';
import { AuthService } from './core/auth/auth.service';
import { WorkspaceComponent } from './features/workspace/workspace.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginScreenComponent, WorkspaceComponent],
  template: `
    @if (auth.isBootstrapping()) {
      <div class="boot">Loading workspace</div>
    } @else if (auth.user(); as user) {
      <app-workspace [user]="user" />
    } @else {
      <app-login-screen />
    }
  `
})
export class AppComponent implements OnInit {
  protected readonly auth = inject(AuthService);

  ngOnInit() {
    void this.auth.bootstrap();
  }
}
