import { Injectable, Logger } from '@nestjs/common';
import type { ICandidateProvider } from './candidate.provider.interface.js';
import type {
  WorkerCandidateDto,
  WorkerMatchProfileDto,
} from './candidate.dto.js';
import { RabbitMQService } from '@app/rabbitmq';

@Injectable()
export class UserTrustCandidateProvider implements ICandidateProvider {
  private readonly logger = new Logger(UserTrustCandidateProvider.name);
  private readonly userTrustServiceUrl: string;

  constructor(private readonly rabbitmq?: RabbitMQService) {
    this.userTrustServiceUrl =
      process.env.USER_TRUST_SERVICE_URL || 'http://localhost:3002';
  }

  async findCandidates(params: {
    serviceId: string;
    latitude: number;
    longitude: number;
    customerUserId?: string;
  }): Promise<WorkerCandidateDto[]> {
    const { serviceId, latitude, longitude, customerUserId } = params;

    // 1. Try HTTP internal endpoint first
    try {
      const url = new URL(
        '/internal/v1/workers/candidates',
        this.userTrustServiceUrl,
      );
      url.searchParams.set('serviceId', serviceId);
      url.searchParams.set('latitude', latitude.toString());
      url.searchParams.set('longitude', longitude.toString());
      if (customerUserId) {
        url.searchParams.set('customerUserId', customerUserId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET || '',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          return data as WorkerCandidateDto[];
        }
      }
    } catch (httpErr) {
      this.logger.debug(
        `HTTP candidate query to User & Trust failed: ${(httpErr as Error).message}. Attempting RPC fallback...`,
      );
    }

    // 2. Try RabbitMQ RPC fallback
    if (this.rabbitmq) {
      try {
        const rpcResult = await this.rabbitmq.send<
          { serviceId: string; latitude: number; longitude: number; customerUserId?: string },
          WorkerCandidateDto[]
        >('workers.find-candidates', {
          serviceId,
          latitude,
          longitude,
          customerUserId,
        });

        if (Array.isArray(rpcResult)) {
          return rpcResult;
        }
      } catch (rpcErr) {
        this.logger.warn(
          `RPC candidate query to User & Trust failed: ${(rpcErr as Error).message}`,
        );
      }
    }

    this.logger.warn(
      `No upstream candidates could be retrieved for service ${serviceId}. Returning empty array.`,
    );
    return [];
  }

  async getWorkerMatchProfile(
    workerUserId: string,
  ): Promise<WorkerMatchProfileDto | null> {
    try {
      const url = new URL(
        `/internal/v1/workers/${workerUserId}/matching-profile`,
        this.userTrustServiceUrl,
      );

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET || '',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        return data as WorkerMatchProfileDto;
      }
    } catch (err) {
      this.logger.debug(
        `Failed to fetch worker profile via HTTP for ${workerUserId}: ${(err as Error).message}`,
      );
    }

    if (this.rabbitmq) {
      try {
        return await this.rabbitmq.send<
          { workerUserId: string },
          WorkerMatchProfileDto | null
        >('workers.get-matching-profile', { workerUserId });
      } catch (rpcErr) {
        this.logger.warn(
          `RPC worker profile lookup failed for ${workerUserId}: ${(rpcErr as Error).message}`,
        );
      }
    }

    return null;
  }
}
