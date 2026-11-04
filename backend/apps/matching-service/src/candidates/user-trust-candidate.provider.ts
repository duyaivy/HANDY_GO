import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ICandidateProvider } from './candidate.provider.interface.js';
import type {
  WorkerCandidateDto,
  WorkerMatchProfileDto,
} from './candidate.dto.js';

@Injectable()
export class UserTrustCandidateProvider implements ICandidateProvider {
  private getBaseUrl(): string {
    const configured = process.env.USER_TRUST_SERVICE_URL;
    if (process.env.NODE_ENV === 'production') {
      if (!configured) throw new Error('USER_TRUST_SERVICE_URL is required in production');
      try {
        const upstream = new URL(configured);
        if (upstream.protocol !== 'http:' || upstream.hostname !== '10.77.0.1'
            || upstream.port !== '3002' || upstream.username || upstream.password) throw new Error();
      } catch {
        throw new Error('USER_TRUST_SERVICE_URL must target User Trust over the VPS1 WireGuard address');
      }
    }
    const raw = (configured || 'http://localhost:3002').replace(/\/+$/, '');
    return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
  }

  private async request(path: string, signal?: AbortSignal): Promise<Response> {
    signal?.throwIfAborted();
    try {
      return await fetch(`${this.getBaseUrl()}${path}`, {
        headers: {
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET || '',
        },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
      });
    } catch (error) {
      signal?.throwIfAborted();
      throw new ServiceUnavailableException('User Trust unavailable', {
        cause: error,
      });
    }
  }

  async findCandidates(
    params: {
      serviceId: string;
      latitude: number;
      longitude: number;
      customerUserId?: string;
    },
    signal?: AbortSignal,
  ): Promise<WorkerCandidateDto[]> {
    const query = new URLSearchParams({
      serviceId: params.serviceId,
      latitude: String(params.latitude),
      longitude: String(params.longitude),
    });
    if (params.customerUserId)
      query.set('customerUserId', params.customerUserId);
    const response = await this.request(
      `/internal/v1/workers/candidates?${query}`,
      signal,
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        'User Trust candidate query failed',
      );
    const body: unknown = await response.json();
    signal?.throwIfAborted();
    if (!Array.isArray(body))
      throw new ServiceUnavailableException(
        'Invalid User Trust candidate response',
      );
    return body as WorkerCandidateDto[];
  }

  async getWorkerMatchProfile(
    workerUserId: string,
  ): Promise<WorkerMatchProfileDto | null> {
    const response = await this.request(
      `/internal/v1/workers/${encodeURIComponent(workerUserId)}/matching-profile`,
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new ServiceUnavailableException('User Trust profile query failed');
    return (await response.json()) as WorkerMatchProfileDto | null;
  }
}
