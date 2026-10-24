import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { RabbitMQService } from '@app/rabbitmq';
import { EVENT_PATTERNS } from '@app/common';
import { RoundsService } from './rounds.service.js';

@Injectable()
export class RoundExpirationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RoundExpirationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private readonly SCAN_INTERVAL_MS =
    process.env.NODE_ENV === 'test' ? 1000 : 15000; // 15 giây định kỳ

  constructor(
    private readonly roundsService: RoundsService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  onModuleInit(): void {
    // Background polling for overdue bidding rounds via composite index [status, closesAt]
    this.timer = setInterval(() => {
      void this.scanAndTriggerExpiration();
    }, this.SCAN_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Triggers expiration scan on demand or during periodic schedule.
   * Finds overdue open rounds and dispatches 'bidding.round.expire_check' via RabbitMQ.
   */
  async scanAndTriggerExpiration(): Promise<number> {
    if (this.isScanning) {
      return 0;
    }
    this.isScanning = true;

    try {
      const now = new Date();
      const overdueRounds = await this.roundsService.findOverdueOpenRounds(50, now);

      if (overdueRounds.length === 0) {
        return 0;
      }

      this.logger.log(
        `Phát hiện ${overdueRounds.length} phiên báo giá đã quá hạn. Bắn sự kiện RabbitMQ để tự động đóng phiên...`,
      );

      for (const round of overdueRounds) {
        try {
          // Bắn message qua RabbitMQ Topic Exchange
          await this.rabbitmq.emit(EVENT_PATTERNS.BIDDING_ROUND_EXPIRE_CHECK, {
            roundId: round.id,
            serviceRequestId: round.serviceRequestId,
            closesAt: round.closesAt.toISOString(),
            triggeredAt: now.toISOString(),
          });
        } catch (emitError) {
          this.logger.error(
            `Lỗi khi bắn sự kiện RabbitMQ expire_check cho round ${round.id}: ${(emitError as Error).message}. Thực hiện đóng trực tiếp...`,
          );
          // Fallback an toàn: nếu RabbitMQ nghẽn tạm thời, tự động đóng trực tiếp
          await this.roundsService.expireRoundIfNeeded(round, now);
        }
      }

      return overdueRounds.length;
    } catch (error) {
      this.logger.warn(
        `Lỗi trong chu kỳ quét phiên quá hạn: ${(error as Error).message}`,
      );
      return 0;
    } finally {
      this.isScanning = false;
    }
  }
}
