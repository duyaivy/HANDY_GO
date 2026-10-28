import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';
import crypto from 'node:crypto';
import type { UserContext } from './order.client.js';

export interface BiddingClientResult {
  status: string;
  closesAt?: string | null;
  opensAt?: string | null;
  total: number;
  page: number;
  limit: number;
  items: any[];
  error?: string;
  statusCode?: number;
}

@Injectable()
export class BiddingClient {
  private readonly logger = new Logger(BiddingClient.name);

  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    const raw = this.config.getUrl('BIDDING_SERVICE_URL').replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  async getBidsAndStatus(
    requestId: string,
    query: { page: number; limit: number },
    user: UserContext,
    correlationId?: string,
  ): Promise<BiddingClientResult> {
    const baseUrl = this.getBaseUrl();
    const reqId = correlationId || crypto.randomUUID();
    const timeoutMs = this.config.upstreamTimeoutMs || 3000;

    const commonHeaders = {
      'Content-Type': 'application/json',
      'x-internal-secret': this.config.internalServiceSecret,
      'x-user-id': user.userId,
      'x-user-roles': user.roles.join(','),
      'x-request-id': reqId,
    };

    const bidsUrl = `${baseUrl}/requests/${requestId}/bids?page=${query.page}&limit=${query.limit}`;
    const statusUrl = `${baseUrl}/requests/${requestId}/bidding-status`;

    const [bidsOutcome, statusOutcome] = await Promise.allSettled([
      fetch(bidsUrl, {
        method: 'GET',
        headers: commonHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      }),
      fetch(statusUrl, {
        method: 'GET',
        headers: commonHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      }),
    ]);

    let roundStatus = 'pending';
    let closesAt: string | null = null;
    let opensAt: string | null = null;

    if (statusOutcome.status === 'fulfilled') {
      const res = statusOutcome.value;
      if (res.status === 200) {
        try {
          const body = (await res.json()) as { data?: any };
          const data = body.data || body;
          roundStatus = data.status || 'open';
          closesAt = data.closesAt ? new Date(data.closesAt).toISOString() : null;
          opensAt = data.opensAt ? new Date(data.opensAt).toISOString() : null;
        } catch {
          // ignore parsing error
        }
      } else if (res.status === 404) {
        roundStatus = 'pending';
      }
    }

    if (bidsOutcome.status === 'rejected') {
      const err = bidsOutcome.reason as Error;
      this.logger.warn(
        `Failed to query bids for request ${requestId}: ${err?.message || err}`,
      );
      return {
        status: 'unavailable',
        closesAt,
        opensAt,
        total: 0,
        page: query.page,
        limit: query.limit,
        items: [],
        error: `Bidding service unavailable: ${err?.message || 'timeout/connection error'}`,
      };
    }

    const bidsRes = bidsOutcome.value;

    if (bidsRes.status === 200) {
      try {
        const body = (await bidsRes.json()) as { data?: any };
        const data = body.data || body;
        return {
          status: roundStatus,
          closesAt,
          opensAt,
          total: Number(data.total ?? (data.items?.length || 0)),
          page: Number(data.page ?? query.page),
          limit: Number(data.limit ?? query.limit),
          items: Array.isArray(data.items) ? data.items : [],
        };
      } catch (parseErr: any) {
        return {
          status: roundStatus,
          closesAt,
          opensAt,
          total: 0,
          page: query.page,
          limit: query.limit,
          items: [],
          error: `Failed to parse bids response: ${parseErr.message}`,
        };
      }
    }

    if (bidsRes.status === 404) {
      return {
        status: roundStatus === 'pending' ? 'pending' : 'no_bid',
        closesAt,
        opensAt,
        total: 0,
        page: query.page,
        limit: query.limit,
        items: [],
      };
    }

    // Upstream 5xx error
    this.logger.warn(
      `Bidding service returned HTTP ${bidsRes.status} for request ${requestId}`,
    );
    return {
      status: 'unavailable',
      closesAt,
      opensAt,
      total: 0,
      page: query.page,
      limit: query.limit,
      items: [],
      statusCode: bidsRes.status,
      error: `Bidding service returned status ${bidsRes.status}`,
    };
  }
}
