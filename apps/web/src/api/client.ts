import type { Board, LoginInput, PdiPlan, SaveBoardInput, User } from '@pdi/contracts';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';
const tokenKey = 'pdi.auth.token';

export const getApiUrl = () => apiUrl;

export const getToken = () => localStorage.getItem(tokenKey);

export const setToken = (token: string | null) =>
  token ? localStorage.setItem(tokenKey, token) : localStorage.removeItem(tokenKey);

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getToken();
  const headers = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers
  };
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const api = {
  login: (input: LoginInput) =>
    request<{ token: string; user: User }>('/auth/login', {
      body: JSON.stringify(input),
      method: 'POST'
    }),
  me: () => request<User>('/auth/me'),
  users: () => request<User[]>('/users'),
  createUser: (input: { email: string; name: string; password: string; role: User['role'] }) =>
    request<User>('/users', {
      body: JSON.stringify(input),
      method: 'POST'
    }),
  pdiPlans: () => request<PdiPlan[]>('/pdi-plans'),
  createPdiPlan: (input: { ownerId?: string; title: string; objective: string; dueDate?: string }) =>
    request<PdiPlan>('/pdi-plans', {
      body: JSON.stringify(input),
      method: 'POST'
    }),
  updatePdiPlan: (
    pdiPlanId: string,
    input: {
      dueDate?: string | null;
      objective?: string;
      ownerId?: string;
      status?: PdiPlan['status'];
      title?: string;
    }
  ) =>
    request<PdiPlan>(`/pdi-plans/${pdiPlanId}`, {
      body: JSON.stringify(input),
      method: 'PATCH'
    }),
  deletePdiPlan: (pdiPlanId: string) =>
    request<void>(`/pdi-plans/${pdiPlanId}`, {
      method: 'DELETE'
    }),
  board: (pdiPlanId: string) => request<Board>(`/pdi-plans/${pdiPlanId}/board`),
  saveBoard: (pdiPlanId: string, input: SaveBoardInput) =>
    request<Board>(`/pdi-plans/${pdiPlanId}/board`, {
      body: JSON.stringify(input),
      method: 'PUT'
    })
};
