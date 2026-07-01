import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear()
    });
    service = new ApiService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and clears the auth token', () => {
    service.setToken('abc');
    expect(service.getToken()).toBe('abc');

    service.setToken(null);
    expect(service.getToken()).toBeNull();
  });

  it('sends authorized GET requests', async () => {
    service.setToken('token-123');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ canCreateAdmin: true }), { status: 200 }));

    const result = await service.bootstrapStatus();

    expect(result).toEqual({ canCreateAdmin: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
  });

  it('serializes JSON bodies and sets the content type', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: 't', user: {} }), { status: 200 }));

    await service.login({ email: 'a@b.com', password: 'secret1' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/auth/login');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(service.deleteUser('u1')).resolves.toBeUndefined();
  });

  it('raises an ApiRequestError with the server message on non-ok responses', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Boom' }), { status: 400 }));

    await expect(service.pdiPlans()).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'Boom',
      status: 400
    });
  });

  it('falls back to a generic message when the error body is empty', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(service.pdiPlans()).rejects.toMatchObject({
      message: 'Request failed with 500',
      status: 500
    });
  });

  it('wraps network failures as connection errors', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const error = await service.pdiPlans().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBeNull();
  });

  it('returns the raw body when the error payload is not json', async () => {
    fetchMock.mockResolvedValue(new Response('plain text failure', { status: 502 }));

    await expect(service.pdiPlans()).rejects.toMatchObject({ message: 'plain text failure', status: 502 });
  });

  describe('endpoint coverage', () => {
    const cases: Array<{ name: string; call: () => Promise<unknown>; method: string; path: string }> = [
      { name: 'me', call: () => service.me(), method: 'GET', path: '/auth/me' },
      { name: 'users', call: () => service.users(), method: 'GET', path: '/users' },
      {
        name: 'createUser',
        call: () => service.createUser({ email: 'a@b.com', name: 'A', password: 'secret1', role: 'MEMBER' }),
        method: 'POST',
        path: '/users'
      },
      { name: 'deleteUser', call: () => service.deleteUser('u1'), method: 'DELETE', path: '/users/u1' },
      { name: 'pdiPlans', call: () => service.pdiPlans(), method: 'GET', path: '/pdi-plans' },
      {
        name: 'createPdiPlan',
        call: () => service.createPdiPlan({ title: 'T', objective: 'O' }),
        method: 'POST',
        path: '/pdi-plans'
      },
      {
        name: 'updatePdiPlan',
        call: () => service.updatePdiPlan('p1', { title: 'T' }),
        method: 'PATCH',
        path: '/pdi-plans/p1'
      },
      { name: 'deletePdiPlan', call: () => service.deletePdiPlan('p1'), method: 'DELETE', path: '/pdi-plans/p1' },
      { name: 'exportPdiPlan', call: () => service.exportPdiPlan('p1'), method: 'GET', path: '/pdi-plans/p1/export' },
      { name: 'board', call: () => service.board('p1'), method: 'GET', path: '/pdi-plans/p1/board' }
    ];

    it.each(cases)('calls $name with $method $path', async ({ call, method, path }) => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      await call();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain(path);
      expect(init.method ?? 'GET').toBe(method);
    });

    it('saves a board with PUT and an import with POST', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      await service.saveBoard('p1', { title: 'B', nodes: [], edges: [] });
      expect(fetchMock.mock.calls[0]![1].method).toBe('PUT');

      fetchMock.mockClear();
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
      await service.importPdiPlan({
        exportedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
        plan: { title: 'Plan', objective: 'Objective', status: 'ACTIVE', dueDate: null },
        board: { title: 'Board', nodes: [], edges: [] }
      });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/pdi-plans/import');
      expect(init.method).toBe('POST');
    });
  });
});
