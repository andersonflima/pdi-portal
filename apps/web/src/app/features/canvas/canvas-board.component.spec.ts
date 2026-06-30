import { importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Board, PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api/api.service';
import { appLucideIcons } from '../../shared/lucide-icons';
import { CanvasBoardComponent } from './canvas-board.component';
import { CanvasLiveSyncService } from './application/canvas-live-sync.service';

const plan: PdiPlan = {
  id: 'plan-1',
  ownerId: 'user-1',
  title: 'Growth plan',
  objective: 'Grow',
  status: 'ACTIVE',
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z'
};

const user: User = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: 'ADMIN' };

const emptyBoard = (): Board => ({
  id: 'plan-1',
  pdiPlanId: 'plan-1',
  title: 'Growth plan',
  nodes: [],
  edges: [],
  updatedAt: '2026-01-01T00:00:00.000Z'
});

const apiMock = {
  apiUrl: 'http://localhost:3333',
  getToken: vi.fn(() => 'test-token'),
  board: vi.fn(async () => emptyBoard()),
  saveBoard: vi.fn(async () => emptyBoard())
};

const liveSyncMock = {
  clientId: 'test-client',
  connect: vi.fn(),
  send: vi.fn(),
  close: vi.fn()
};

const setup = async (): Promise<ComponentFixture<CanvasBoardComponent>> => {
  await TestBed.configureTestingModule({
    imports: [CanvasBoardComponent],
    providers: [
      { provide: ApiService, useValue: apiMock },
      importProvidersFrom(LucideAngularModule.pick(appLucideIcons))
    ]
  })
    .overrideComponent(CanvasBoardComponent, {
      add: { providers: [{ provide: CanvasLiveSyncService, useValue: liveSyncMock }] }
    })
    .compileComponents();

  const fixture = TestBed.createComponent(CanvasBoardComponent);

  fixture.componentRef.setInput('isCreatingPlan', false);
  fixture.componentRef.setInput('isExportingPlan', false);
  fixture.componentRef.setInput('isImportingPlan', false);
  fixture.componentRef.setInput('plan', plan);
  fixture.componentRef.setInput('plans', [plan]);
  fixture.componentRef.setInput('user', user);
  fixture.componentRef.setInput('users', [user]);
  fixture.componentRef.setInput('usersCount', 1);

  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
};

describe('CanvasBoardComponent (integration)', () => {
  beforeEach(() => {
    apiMock.board.mockClear();
    liveSyncMock.connect.mockClear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders and loads the board for the active plan', async () => {
    const fixture = await setup();

    expect(fixture.componentInstance).toBeTruthy();
    expect(apiMock.board).toHaveBeenCalledWith('plan-1');
  });

  it('adds a node to the board when a node is created', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance as unknown as {
      nodes: () => unknown[];
      handleCreateNode: (event: { kind: string }) => void;
    };

    expect(component.nodes()).toHaveLength(0);

    component.handleCreateNode({ kind: 'NOTE' });
    fixture.detectChanges();

    expect(component.nodes()).toHaveLength(1);
  });

  it('removes the selected node on Delete', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance as unknown as {
      nodes: () => { id: string }[];
      handleCreateNode: (event: { kind: string }) => void;
      handleWindowKeydown: (event: KeyboardEvent) => void;
      canvasFacade: { selectSingleNode: (id: string) => void };
    };

    component.handleCreateNode({ kind: 'NOTE' });
    fixture.detectChanges();
    const createdId = component.nodes()[0]!.id;
    component.canvasFacade.selectSingleNode(createdId);
    fixture.detectChanges();

    component.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'Delete' }));
    fixture.detectChanges();

    expect(component.nodes()).toHaveLength(0);
  });
});
