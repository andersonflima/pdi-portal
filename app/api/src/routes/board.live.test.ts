import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, createPdiPlan, createUser } from '../database.js';
import { createTestApp } from '../../test/app.js';

let app: FastifyInstance;
let baseUrl: string;
let planId: string;
let ownerToken: string;
let strangerToken: string;

const liveUrl = (id: string, clientId: string, token: string) =>
  `${baseUrl}/api/pdi-plans/${id}/board/live?clientId=${clientId}&token=${encodeURIComponent(token)}`;

const waitForOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

const waitForMessage = (socket: WebSocket, timeoutMs = 2000) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
  });

const waitForClose = (socket: WebSocket, timeoutMs = 2000) =>
  new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
    socket.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

beforeAll(async () => {
  app = await createTestApp();
  const owner = createUser({ id: 'live-owner', email: 'live-owner@pdi.local', name: 'Owner', passwordHash: 'hash', role: 'MEMBER' });
  createUser({ id: 'live-stranger', email: 'live-stranger@pdi.local', name: 'Stranger', passwordHash: 'hash', role: 'MEMBER' });
  const plan = createPdiPlan({ ownerId: owner.id, title: 'Live board plan', objective: 'Collaborate live' });
  planId = plan.id;
  ownerToken = app.jwt.sign({ id: 'live-owner', role: 'MEMBER' });
  strangerToken = app.jwt.sign({ id: 'live-stranger', role: 'MEMBER' });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('board live websocket', () => {
  it('closes the socket when the plan is not accessible', async () => {
    const socket = new WebSocket(liveUrl(planId, 'stranger', strangerToken));
    const code = await waitForClose(socket);

    expect(code).toBe(1008);
  });

  it('broadcasts board sync messages to other peers', async () => {
    const sender = new WebSocket(liveUrl(planId, 'sender', ownerToken));
    const receiver = new WebSocket(liveUrl(planId, 'receiver', ownerToken));

    await Promise.all([waitForOpen(sender), waitForOpen(receiver)]);

    const inbound = waitForMessage(receiver);
    sender.send(
      JSON.stringify({
        clientId: 'sender',
        type: 'BOARD_SYNC',
        payload: { title: 'Live title', nodes: [], edges: [] }
      })
    );

    const message = await inbound;
    expect(message.type).toBe('BOARD_SYNC');
    expect(message.clientId).toBe('sender');
    expect((message.payload as { title: string }).title).toBe('Live title');

    sender.close();
    receiver.close();
  });

  it('ignores malformed messages without broadcasting', async () => {
    const sender = new WebSocket(liveUrl(planId, 'sender2', ownerToken));
    const receiver = new WebSocket(liveUrl(planId, 'receiver2', ownerToken));

    await Promise.all([waitForOpen(sender), waitForOpen(receiver)]);

    let received = false;
    receiver.once('message', () => {
      received = true;
    });

    sender.send(JSON.stringify({ not: 'a valid message' }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(received).toBe(false);

    sender.close();
    receiver.close();
  });
});
