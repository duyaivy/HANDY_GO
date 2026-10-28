import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import type {
  BidChangedKind,
  MatchingChangedKind,
  RoundChangedKind,
  SseBidChangedEvent,
  SseClientConnection,
  SseMatchingChangedEvent,
  SseReadyEvent,
  SseRoundChangedEvent,
} from './sse.interfaces.js';

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);

  public readonly HEARTBEAT_INTERVAL_MS = 15000;
  public readonly MAX_CONNECTIONS_PER_REQUEST = 100;
  public readonly MAX_TOTAL_CONNECTIONS = 5000;

  private readonly clientsByRequest = new Map<string, Set<SseClientConnection>>();
  private readonly clientsById = new Map<string, SseClientConnection>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  onModuleDestroy(): void {
    this.stopHeartbeat();
    this.closeAllConnections();
  }

  /**
   * Registers a client connection to receive SSE frames for a specific service request.
   */
  registerClient(connection: SseClientConnection): void {
    if (this.clientsById.size >= this.MAX_TOTAL_CONNECTIONS) {
      this.logger.warn(
        `Max total SSE connections limit reached (${this.MAX_TOTAL_CONNECTIONS}). Rejecting new connection.`,
      );
      throw new ServiceUnavailableException(
        'Server capacity for active SSE connections reached. Please retry later.',
      );
    }

    const currentRequestSet = this.clientsByRequest.get(connection.requestId);
    if (currentRequestSet && currentRequestSet.size >= this.MAX_CONNECTIONS_PER_REQUEST) {
      this.logger.warn(
        `Max SSE connections per request reached (${this.MAX_CONNECTIONS_PER_REQUEST}) for request ${connection.requestId}.`,
      );
      throw new BadRequestException(
        'Too many active event streams for this request. Please close unused connections.',
      );
    }

    // Write SSE streaming headers
    connection.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    connection.res.flushHeaders?.();

    // Store connection
    this.clientsById.set(connection.id, connection);
    let set = this.clientsByRequest.get(connection.requestId);
    if (!set) {
      set = new Set<SseClientConnection>();
      this.clientsByRequest.set(connection.requestId, set);
    }
    set.add(connection);

    this.logger.log(
      `SSE client ${connection.id} registered for request ${connection.requestId} (User: ${connection.userId}, Roles: ${connection.roles.join(',')}). Active subscribers for request: ${set.size}`,
    );

    // Immediately emit initial ready event
    const readyEvent: SseReadyEvent = {
      requestId: connection.requestId,
      connectedAt: connection.connectedAt.toISOString(),
      heartbeatIntervalMs: this.HEARTBEAT_INTERVAL_MS,
    };
    this.sendEventToClient(connection, 'ready', readyEvent);

    // Register cleanup on disconnect or socket close
    const cleanup = () => {
      this.removeClient(connection.id);
    };

    connection.res.on('close', cleanup);
    connection.res.on('finish', cleanup);
    connection.res.on('error', (err) => {
      this.logger.warn(`SSE client socket error for ${connection.id}: ${err.message}`);
      cleanup();
    });
  }

  /**
   * Removes and cleans up a subscriber connection.
   */
  removeClient(connectionId: string): void {
    const client = this.clientsById.get(connectionId);
    if (!client) {
      return;
    }

    this.clientsById.delete(connectionId);
    const set = this.clientsByRequest.get(client.requestId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.clientsByRequest.delete(client.requestId);
      }
    }

    this.logger.log(
      `SSE client ${connectionId} disconnected from request ${client.requestId}. Remaining request subscribers: ${set ? set.size : 0}`,
    );
  }

  /**
   * Broadcasts a lightweight bid lifecycle change signal to all active clients for the request.
   */
  broadcastBidChanged(
    requestId: string,
    kind: BidChangedKind,
    eventId = crypto.randomUUID(),
    occurredAt = new Date().toISOString(),
  ): void {
    const payload: SseBidChangedEvent = {
      eventId,
      requestId,
      kind,
      occurredAt,
    };
    this.broadcastToRequest(requestId, 'bid.changed', payload);
  }

  /**
   * Broadcasts a lightweight round lifecycle change signal to all active clients for the request.
   */
  broadcastRoundChanged(
    requestId: string,
    kind: RoundChangedKind,
    eventId = crypto.randomUUID(),
    occurredAt = new Date().toISOString(),
  ): void {
    const payload: SseRoundChangedEvent = {
      eventId,
      requestId,
      kind,
      occurredAt,
    };
    this.broadcastToRequest(requestId, 'round.changed', payload);
  }

  /**
   * Broadcasts an AI matching status change signal to all active clients for the request.
   */
  broadcastMatchingChanged(
    requestId: string,
    kind: MatchingChangedKind,
    eventId = crypto.randomUUID(),
    occurredAt = new Date().toISOString(),
  ): void {
    const payload: SseMatchingChangedEvent = {
      eventId,
      requestId,
      kind,
      occurredAt,
    };
    this.broadcastToRequest(requestId, 'matching.changed', payload);
  }

  /**
   * Broadcasts a named event frame to all subscribers of a request.
   */
  broadcastToRequest(requestId: string, eventName: string, data: unknown): void {
    const set = this.clientsByRequest.get(requestId);
    if (!set || set.size === 0) {
      return;
    }

    const frame = this.formatSseFrame(eventName, data);
    for (const client of Array.from(set)) {
      try {
        client.res.write(frame);
      } catch (err) {
        this.logger.error(
          `Failed to write SSE frame to client ${client.id}: ${(err as Error).message}`,
        );
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Sends a 15-second keep-alive comment to prevent proxy/socket termination.
   */
  broadcastHeartbeat(): void {
    if (this.clientsById.size === 0) {
      return;
    }

    const comment = `:keepalive ${new Date().toISOString()}\n\n`;
    for (const client of Array.from(this.clientsById.values())) {
      try {
        client.res.write(comment);
      } catch (err) {
        this.logger.warn(
          `Failed to write heartbeat to client ${client.id}: ${(err as Error).message}`,
        );
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Formats a SSE message block.
   */
  formatSseFrame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * Get active connection count globally or for a specific request.
   */
  getClientCount(requestId?: string): number {
    if (requestId) {
      return this.clientsByRequest.get(requestId)?.size ?? 0;
    }
    return this.clientsById.size;
  }

  private sendEventToClient(
    client: SseClientConnection,
    eventName: string,
    data: unknown,
  ): void {
    try {
      client.res.write(this.formatSseFrame(eventName, data));
    } catch (err) {
      this.logger.error(
        `Failed to send event ${eventName} to client ${client.id}: ${(err as Error).message}`,
      );
      this.removeClient(client.id);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private closeAllConnections(): void {
    for (const client of Array.from(this.clientsById.values())) {
      try {
        client.res.end();
      } catch {
        // Ignored during shutdown
      }
    }
    this.clientsById.clear();
    this.clientsByRequest.clear();
  }
}
