import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { AppException, ERROR_CODES } from '@app/common';

export interface UserAuthStatusRpcResponse {
  exists: boolean;
  status: string;
  isProvisioned: boolean;
}

@Injectable()
export class UserTrustClient {
  private readonly logger = new Logger(UserTrustClient.name);

  constructor(
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
  ) {}

  async confirmUserStatus(userId: string, roles: string[]): Promise<void> {
    if (!this.rabbitmq) {
      this.logger.error('RabbitMQService is not available for User & Trust RPC');
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        'Dịch vụ quản lý hồ sơ tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }

    try {
      const statusPromise = this.rabbitmq.send<
        { userId: string; roles: string[] },
        UserAuthStatusRpcResponse
      >('user.auth-status', { userId, roles });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('User & Trust RPC timeout')),
          3000,
        );
        timer.unref?.();
      });

      const status = await Promise.race([statusPromise, timeoutPromise]);

      if (!status || !status.exists || !status.isProvisioned) {
        throw new AppException(
          HttpStatus.FAILED_DEPENDENCY,
          ERROR_CODES.PROFILE_NOT_READY,
          'Hồ sơ người dùng đang được khởi tạo. Vui lòng thử lại sau giây lát.',
        );
      }

      if (status.status === 'suspended' || status.status === 'deleted') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.ACCOUNT_BLOCKED,
          'Tài khoản người dùng đã bị tạm khóa hoặc ngừng hoạt động.',
        );
      }
    } catch (err: unknown) {
      if (err instanceof AppException) {
        throw err;
      }
      this.logger.error(
        `Failed to confirm user status for userId ${userId}: ${(err as Error)?.message}`,
      );
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        'Dịch vụ quản lý hồ sơ tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }
  }
}
