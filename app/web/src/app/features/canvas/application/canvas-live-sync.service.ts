import { Injectable } from '@angular/core';
import type { Board, SaveBoardInput } from '@pdi/contracts';

/** Remote board payload broadcast by peers (server emits a full Board DTO). */
export type RemoteBoardPayload = Board;

type LiveConnectInput = {
  apiUrl: string;
  planId: string;
  token: string | null;
  onRemoteBoard: (payload: RemoteBoardPayload) => void;
};

export const toLiveWebSocketUrl = (apiUrl: string, pdiPlanId: string, clientId: string, token: string | null) => {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/pdi-plans/${pdiPlanId}/board/live`;
  url.searchParams.set('clientId', clientId);
  url.searchParams.set('token', token ?? '');

  return url.toString();
};

/**
 * Owns the realtime board WebSocket transport: connection lifecycle, this
 * client's id, outbound board broadcasts and inbound message filtering. The
 * component applies the remote board to its own state via the onRemoteBoard
 * callback, keeping signal/state mutation out of the transport layer.
 */
@Injectable()
export class CanvasLiveSyncService {
  readonly clientId = crypto.randomUUID();

  private socket: WebSocket | null = null;

  connect(input: LiveConnectInput) {
    this.close();

    const socket = new WebSocket(toLiveWebSocketUrl(input.apiUrl, input.planId, this.clientId, input.token));
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        clientId: string;
        payload: RemoteBoardPayload;
        type: 'BOARD_SYNC';
      };

      if (message.type !== 'BOARD_SYNC' || message.clientId === this.clientId) return;

      input.onRemoteBoard(message.payload);
    });
  }

  send(payload: SaveBoardInput) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(
      JSON.stringify({
        clientId: this.clientId,
        payload,
        type: 'BOARD_SYNC'
      })
    );
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}
