import { Injectable, inject, signal } from '@angular/core';
import type { User } from '@pdi/contracts';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly user = signal<User | null>(null);
  readonly isBootstrapping = signal(true);

  readonly createBootstrapAdmin = async (input: { email: string; name: string; password: string }) => {
    const session = await this.api.createBootstrapAdmin(input);
    this.api.setToken(session.token);
    this.user.set(session.user);
  };

  readonly login = async (email: string, password: string) => {
    const session = await this.api.login({ email, password });
    this.api.setToken(session.token);
    this.user.set(session.user);
  };

  readonly logout = () => {
    this.api.setToken(null);
    this.user.set(null);
  };

  readonly bootstrap = async () => {
    if (!this.api.getToken()) {
      this.user.set(null);
      this.isBootstrapping.set(false);
      return;
    }

    try {
      this.user.set(await this.api.me());
    } catch {
      this.api.setToken(null);
      this.user.set(null);
    } finally {
      this.isBootstrapping.set(false);
    }
  };
}
