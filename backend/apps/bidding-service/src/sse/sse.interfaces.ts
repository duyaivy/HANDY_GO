import type { Response } from 'express';

export type BidChangedKind = 'submitted' | 'revised' | 'withdrawn';
export type RoundChangedKind =
  | 'opened'
  | 'closed'
  | 'extended'
  | 'finalized'
  | 'cancelled'
  | 'no_bid';
export type MatchingChangedKind = 'completed' | 'failed';

/** Initial event emitted immediately upon establishing an SSE connection */
export interface SseReadyEvent {
  requestId: string;
  connectedAt: string;
  heartbeatIntervalMs: number;
}

/** Lightweight notification when a bid is submitted, revised, or withdrawn. Zero confidential data. */
export interface SseBidChangedEvent {
  eventId: string;
  requestId: string;
  kind: BidChangedKind;
  occurredAt: string;
}

/** Lightweight notification when a bidding round changes state. */
export interface SseRoundChangedEvent {
  eventId: string;
  requestId: string;
  kind: RoundChangedKind;
  occurredAt: string;
}

/** Lightweight notification when AI matching completes or fails for the request. */
export interface SseMatchingChangedEvent {
  eventId: string;
  requestId: string;
  kind: MatchingChangedKind;
  occurredAt: string;
}

export type SseEventPayloadMap = {
  'ready': SseReadyEvent;
  'bid.changed': SseBidChangedEvent;
  'round.changed': SseRoundChangedEvent;
  'matching.changed': SseMatchingChangedEvent;
};

export interface SseClientConnection {
  readonly id: string;
  readonly requestId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly res: Response;
  readonly connectedAt: Date;
}

export interface FanoutEventPayload {
  eventType: string;
  requestId: string;
  eventId?: string;
  occurredAt?: string;
  kind?: string;
  [key: string]: unknown;
}
