import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { AppException, ERROR_CODES } from '@app/common';

export type BroadcastTargetGroup = 'ALL' | 'CUSTOMERS' | 'WORKERS';

export interface GetAllActiveUserIdsResponse {
  userIds: string[];
}

@Injectable()
export class UserTrustRpcClient {
  private readonly logger = new Logger(UserTrustRpcClient.name);

  constructor(
    @Inject('USER_TRUST_RPC_CLIENT')
    private readonly rpcClient: ClientProxy,
  ) {}

  async getAllActiveUserIds(
    targetGroup?: BroadcastTargetGroup,
  ): Promise<string[]> {
    try {
      const responsePromise = lastValueFrom(
        this.rpcClient.send<GetAllActiveUserIdsResponse, { targetGroup: BroadcastTargetGroup }>(
          'user.get-all-active-ids',
          { targetGroup: targetGroup ?? 'ALL' },
        ),
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('User & Trust RPC timeout')),
          10000,
        );
        timer.unref?.();
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      return response?.userIds ?? [];
    } catch (err: unknown) {
      if (err instanceof AppException) {
        throw err;
      }
      this.logger.error(
        `Failed to fetch active users from user-trust-service: ${(err as Error)?.message}`,
      );
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        'Dịch vụ quản lý hồ sơ người dùng tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }
  }
}
