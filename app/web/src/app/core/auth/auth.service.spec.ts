import { TestBed } from '@angular/core/testing';
import type { User } from '@pdi/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api/api.service';
import { AuthService } from './auth.service';

const adminUser: User = { id: 'u1', name: 'Admin', email: 'admin@pdi.local', role: 'ADMIN' };

const createApiMock = () => ({
  createBootstrapAdmin: vi.fn(),
  login: vi.fn(),
  me: vi.fn(),
  getToken: vi.fn(),
  setToken: vi.fn()
});

let apiMock: ReturnType<typeof createApiMock>;

const buildService = () => {
  TestBed.configureTestingModule({
    providers: [AuthService, { provide: ApiService, useValue: apiMock }]
  });
  return TestBed.inject(AuthService);
};

describe('AuthService', () => {
  beforeEach(() => {
    apiMock = createApiMock();
    TestBed.resetTestingModule();
  });

  it('creates a bootstrap admin and persists the session', async () => {
    apiMock.createBootstrapAdmin.mockResolvedValue({ token: 'tok', user: adminUser });
    const service = buildService();

    await service.createBootstrapAdmin({ email: adminUser.email, name: adminUser.name, password: 'longpass1' });

    expect(apiMock.setToken).toHaveBeenCalledWith('tok');
    expect(service.user()).toEqual(adminUser);
  });

  it('logs in and stores the user', async () => {
    apiMock.login.mockResolvedValue({ token: 'tok', user: adminUser });
    const service = buildService();

    await service.login('admin@pdi.local', 'longpass1');

    expect(apiMock.login).toHaveBeenCalledWith({ email: 'admin@pdi.local', password: 'longpass1' });
    expect(service.user()).toEqual(adminUser);
  });

  it('logs out and clears the session', () => {
    const service = buildService();
    service.user.set(adminUser);

    service.logout();

    expect(apiMock.setToken).toHaveBeenCalledWith(null);
    expect(service.user()).toBeNull();
  });

  it('bootstrap without a token leaves the user empty', async () => {
    apiMock.getToken.mockReturnValue(null);
    const service = buildService();

    await service.bootstrap();

    expect(service.user()).toBeNull();
    expect(service.isBootstrapping()).toBe(false);
  });

  it('bootstrap resolves the current user when a token exists', async () => {
    apiMock.getToken.mockReturnValue('tok');
    apiMock.me.mockResolvedValue(adminUser);
    const service = buildService();

    await service.bootstrap();

    expect(service.user()).toEqual(adminUser);
    expect(service.isBootstrapping()).toBe(false);
  });

  it('bootstrap clears the token when validation fails', async () => {
    apiMock.getToken.mockReturnValue('tok');
    apiMock.me.mockRejectedValue(new Error('expired'));
    const service = buildService();

    await service.bootstrap();

    expect(apiMock.setToken).toHaveBeenCalledWith(null);
    expect(service.user()).toBeNull();
    expect(service.isBootstrapping()).toBe(false);
  });
});
