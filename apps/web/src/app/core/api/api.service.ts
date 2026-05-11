import { Injectable } from '@angular/core';
import type {
  Board,
  BootstrapAdminInput,
  BootstrapStatus,
  LoginInput,
  PdiPlan,
  SaveBoardInput,
  User
} from '@pdi/contracts';
import { environment } from '../../../environments/environment';

const tokenKey = 'pdi.auth.token';

const toRequestHeaders = (token: string | null, init: RequestInit) => ({
  ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...init.headers
});

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly apiUrl = environment.apiUrl;

  readonly getToken = () => localStorage.getItem(tokenKey);

  readonly setToken = (token: string | null) =>
    token ? localStorage.setItem(tokenKey, token) : localStorage.removeItem(tokenKey);

  private readonly request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: toRequestHeaders(this.getToken(), init)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with ${response.status}`);
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };

  readonly bootstrapStatus = () => this.request<BootstrapStatus>('/auth/bootstrap-status');

  readonly createBootstrapAdmin = (input: BootstrapAdminInput) =>
    this.request<{ token: string; user: User }>('/auth/bootstrap-admin', {
      body: JSON.stringify(input),
      method: 'POST'
    });

  readonly login = (input: LoginInput) =>
    this.request<{ token: string; user: User }>('/auth/login', {
      body: JSON.stringify(input),
      method: 'POST'
    });

  readonly me = () => this.request<User>('/auth/me');

  readonly users = () => this.request<User[]>('/users');

  readonly createUser = (input: { email: string; name: string; password: string; role: User['role'] }) =>
    this.request<User>('/users', {
      body: JSON.stringify(input),
      method: 'POST'
    });

  readonly pdiPlans = () => this.request<PdiPlan[]>('/pdi-plans');

  readonly createPdiPlan = (input: { dueDate?: string; objective: string; ownerId?: string; title: string }) =>
    this.request<PdiPlan>('/pdi-plans', {
      body: JSON.stringify(input),
      method: 'POST'
    });

  readonly updatePdiPlan = (
    pdiPlanId: string,
    input: {
      dueDate?: string | null;
      objective?: string;
      ownerId?: string;
      status?: PdiPlan['status'];
      title?: string;
    }
  ) =>
    this.request<PdiPlan>(`/pdi-plans/${pdiPlanId}`, {
      body: JSON.stringify(input),
      method: 'PATCH'
    });

  readonly deletePdiPlan = (pdiPlanId: string) =>
    this.request<void>(`/pdi-plans/${pdiPlanId}`, {
      method: 'DELETE'
    });

  readonly board = (pdiPlanId: string) => this.request<Board>(`/pdi-plans/${pdiPlanId}/board`);

  readonly saveBoard = (pdiPlanId: string, input: SaveBoardInput) =>
    this.request<Board>(`/pdi-plans/${pdiPlanId}/board`, {
      body: JSON.stringify(input),
      method: 'PUT'
    });
}
