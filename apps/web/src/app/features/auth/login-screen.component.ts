import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiRequestError, ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const toAuthErrorMessage = (error: unknown, canCreateAdmin: boolean) => {
  if (error instanceof ApiRequestError && error.status === null) return error.message;
  if (error instanceof ApiRequestError && error.status !== 401) return error.message;

  return canCreateAdmin ? 'Could not create admin user' : 'Invalid email or password';
};

@Component({
  selector: 'app-login-screen',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './login-screen.component.html',
  styleUrl: './login-screen.component.css'
})
export class LoginScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly adminName = signal('');
  readonly email = signal('admin@pdi.local');
  readonly password = signal('admin123');
  readonly canCreateAdmin = signal(false);
  readonly error = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  ngOnInit() {
    void this.api
      .bootstrapStatus()
      .then((status) => {
        this.canCreateAdmin.set(status.canCreateAdmin);

        if (status.canCreateAdmin) {
          this.email.set('');
          this.password.set('');
        }
      })
      .catch(() => this.canCreateAdmin.set(false));
  }

  readonly handleSubmit = async () => {
    this.error.set(null);
    this.isSubmitting.set(true);

    try {
      if (this.canCreateAdmin()) {
        await this.auth.createBootstrapAdmin({
          email: this.email(),
          name: this.adminName(),
          password: this.password()
        });
        return;
      }

      await this.auth.login(this.email(), this.password());
    } catch (error) {
      this.error.set(toAuthErrorMessage(error, this.canCreateAdmin()));
    } finally {
      this.isSubmitting.set(false);
    }
  };
}
