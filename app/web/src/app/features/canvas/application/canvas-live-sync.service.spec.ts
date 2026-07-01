import type { Board, SaveBoardInput } from '@pdi/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasLiveSyncService, toLiveWebSocketUrl } from './canvas-live-sync.service';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  private readonly listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: unknown) {
    (this.listeners[type] ?? []).forEach((cb) => cb(event));
  }
}

const board = (title: string): Board => ({
  id: 'b1',
  pdiPlanId: 'p1',
  title,
  nodes: [],
  edges: [],
  updatedAt: '2026-01-01T00:00:00.000Z'
});

const saveInput: SaveBoardInput = { title: 'Outbound', nodes: [], edges: [] };

describe('toLiveWebSocketUrl', () => {
  it('builds a ws/wss live url with client id and token', () => {
    expect(toLiveWebSocketUrl('http://localhost:3333/api', 'p1', 'c1', 't1')).toBe(
      'ws://localhost:3333/api/pdi-plans/p1/board/live?clientId=c1&token=t1'
    );
    expect(toLiveWebSocketUrl('https://app.test/api/', 'p2', 'c2', null)).toBe(
      'wss://app.test/api/pdi-plans/p2/board/live?clientId=c2&token='
    );
  });
});

describe('CanvasLiveSyncService', () => {
  let service: CanvasLiveSyncService;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    service = new CanvasLiveSyncService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to the live url for the plan', () => {
    service.connect({ apiUrl: 'http://localhost:3333/api', planId: 'p1', token: 't', onRemoteBoard: () => {} });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain('/pdi-plans/p1/board/live');
  });

  it('closes the previous socket when reconnecting', () => {
    service.connect({ apiUrl: 'http://x/api', planId: 'p1', token: null, onRemoteBoard: () => {} });
    service.connect({ apiUrl: 'http://x/api', planId: 'p2', token: null, onRemoteBoard: () => {} });

    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(FakeWebSocket.instances[1]!.closed).toBe(false);
  });

  it('delivers remote BOARD_SYNC messages from other clients', () => {
    const received: string[] = [];
    service.connect({ apiUrl: 'http://x/api', planId: 'p1', token: null, onRemoteBoard: (p) => received.push(p.title) });

    FakeWebSocket.instances[0]!.emit('message', {
      data: JSON.stringify({ clientId: 'other', payload: board('Remote'), type: 'BOARD_SYNC' })
    });

    expect(received).toEqual(['Remote']);
  });

  it('ignores its own echoed messages and non board-sync messages', () => {
    const received: string[] = [];
    service.connect({ apiUrl: 'http://x/api', planId: 'p1', token: null, onRemoteBoard: (p) => received.push(p.title) });

    FakeWebSocket.instances[0]!.emit('message', {
      data: JSON.stringify({ clientId: service.clientId, payload: board('Echo'), type: 'BOARD_SYNC' })
    });
    FakeWebSocket.instances[0]!.emit('message', {
      data: JSON.stringify({ clientId: 'other', payload: board('Other'), type: 'PRESENCE' })
    });

    expect(received).toEqual([]);
  });

  it('sends board payloads only while the socket is open', () => {
    service.connect({ apiUrl: 'http://x/api', planId: 'p1', token: null, onRemoteBoard: () => {} });
    const socket = FakeWebSocket.instances[0]!;

    service.send(saveInput);
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ clientId: service.clientId, type: 'BOARD_SYNC' });

    socket.readyState = 0; // CONNECTING / not open
    service.send(saveInput);
    expect(socket.sent).toHaveLength(1);
  });

  it('does nothing on send before connecting', () => {
    expect(() => service.send(saveInput)).not.toThrow();
  });
});
