import { TestBed } from '@angular/core/testing';
import type { PdiPlan, User } from '@pdi/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api/api.service';
import { WorkspaceService } from './workspace.service';

const plan = (id: string, overrides: Partial<PdiPlan> = {}): PdiPlan => ({
  id,
  ownerId: 'owner',
  title: `Plan ${id}`,
  objective: 'Objective',
  status: 'ACTIVE',
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

const admin: User = { id: 'a', name: 'Admin', email: 'admin@pdi.local', role: 'ADMIN' };
const member: User = { id: 'm', name: 'Member', email: 'member@pdi.local', role: 'MEMBER' };

const createApiMock = () => ({
  pdiPlans: vi.fn().mockResolvedValue([]),
  users: vi.fn().mockResolvedValue([]),
  createPdiPlan: vi.fn(),
  updatePdiPlan: vi.fn(),
  deletePdiPlan: vi.fn().mockResolvedValue(undefined),
  exportPdiPlan: vi.fn(),
  importPdiPlan: vi.fn(),
  createUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined)
});

let apiMock: ReturnType<typeof createApiMock>;

const buildService = () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [WorkspaceService, { provide: ApiService, useValue: apiMock }]
  });
  return TestBed.inject(WorkspaceService);
};

describe('WorkspaceService', () => {
  beforeEach(() => {
    apiMock = createApiMock();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads plans and users for an admin', async () => {
    apiMock.pdiPlans.mockResolvedValue([plan('p1'), plan('p2')]);
    apiMock.users.mockResolvedValue([admin]);
    const service = buildService();

    await service.load(admin);

    expect(service.plans()).toHaveLength(2);
    expect(service.users()).toEqual([admin]);
    expect(service.activePlanId()).toBe('p1');
  });

  it('does not request users for a member', async () => {
    apiMock.pdiPlans.mockResolvedValue([plan('p1')]);
    const service = buildService();

    await service.load(member);

    expect(apiMock.users).not.toHaveBeenCalled();
    expect(service.users()).toEqual([]);
  });

  it('computes the active plan with a fallback to the first plan', async () => {
    apiMock.pdiPlans.mockResolvedValue([plan('p1'), plan('p2')]);
    const service = buildService();
    await service.load(member);

    service.selectPlan('missing');
    expect(service.activePlan()?.id).toBe('p1');

    service.selectPlan('p2');
    expect(service.activePlan()?.id).toBe('p2');
  });

  it('creates a plan and marks it active', async () => {
    apiMock.createPdiPlan.mockResolvedValue(plan('new'));
    const service = buildService();

    await service.createPlan({ title: 'New', objective: 'Obj' });

    expect(service.plans()[0]?.id).toBe('new');
    expect(service.activePlanId()).toBe('new');
    expect(service.isCreatingPlan()).toBe(false);
  });

  it('surfaces an alert when creating a plan fails', async () => {
    apiMock.createPdiPlan.mockRejectedValue(new Error('nope'));
    const service = buildService();

    await service.createPlan({ title: 'New', objective: 'Obj' });

    expect(window.alert).toHaveBeenCalledWith('nope');
    expect(service.isCreatingPlan()).toBe(false);
  });

  it('updates a plan in place', async () => {
    apiMock.pdiPlans.mockResolvedValue([plan('p1', { title: 'Old' })]);
    apiMock.updatePdiPlan.mockResolvedValue(plan('p1', { title: 'Updated' }));
    const service = buildService();
    await service.load(member);

    await service.updatePlan('p1', { title: 'Updated' });

    expect(service.plans()[0]?.title).toBe('Updated');
  });

  it('deletes a plan and updates the active selection', async () => {
    apiMock.pdiPlans.mockResolvedValue([plan('p1'), plan('p2')]);
    const service = buildService();
    await service.load(member);
    service.selectPlan('p1');

    await service.deletePlan('p1');

    expect(service.plans().map((item) => item.id)).toEqual(['p2']);
    expect(service.activePlanId()).toBe('p2');
  });

  it('imports a plan from a file', async () => {
    apiMock.importPdiPlan.mockResolvedValue(plan('imported'));
    const service = buildService();
    const file = { text: () => Promise.resolve(JSON.stringify({ version: 1 })) } as unknown as File;

    await service.importPlan(file);

    expect(service.plans()[0]?.id).toBe('imported');
    expect(service.activePlanId()).toBe('imported');
  });

  it('exports a plan as a downloadable json file', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    apiMock.pdiPlans.mockResolvedValue([plan('p1')]);
    apiMock.exportPdiPlan.mockResolvedValue({
      exportedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      plan: { title: 'Plan', objective: 'Objective', status: 'ACTIVE', dueDate: null },
      board: { title: 'Board', nodes: [], edges: [] }
    });
    const service = buildService();
    await service.load(member);

    await service.exportPlan('p1');

    expect(apiMock.exportPdiPlan).toHaveBeenCalledWith('p1');
    expect(createObjectURL).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('ignores export for an unknown plan', async () => {
    const service = buildService();
    await service.exportPlan('missing');
    expect(apiMock.exportPdiPlan).not.toHaveBeenCalled();
  });

  it('creates a user and refreshes the user list', async () => {
    apiMock.users.mockResolvedValue([admin, member]);
    const service = buildService();

    await service.createUser({ email: 'x@pdi.local', name: 'X', password: 'secret1', role: 'MEMBER' });

    expect(apiMock.createUser).toHaveBeenCalled();
    expect(service.users()).toHaveLength(2);
  });

  it('deletes a user and reloads users and plans', async () => {
    apiMock.users.mockResolvedValue([admin]);
    apiMock.pdiPlans.mockResolvedValue([plan('p1')]);
    const service = buildService();

    await service.deleteUser('m');

    expect(apiMock.deleteUser).toHaveBeenCalledWith('m');
    expect(service.users()).toEqual([admin]);
    expect(service.plans().map((item) => item.id)).toEqual(['p1']);
  });
});
