import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

export interface AiHealthState {
  status: 'UP' | 'DOWN' | 'STARTING' | 'DISABLED';
  serviceUrl: string;
  isWarmupEnabled: boolean;
  intervalSeconds: number;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
  consecutiveFailures: number;
  message?: string;
  error?: string;
  data?: unknown;
}

@Injectable()
export class AiWarmupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiWarmupService.name);
  private timer: NodeJS.Timeout | null = null;
  private previousStatus: 'UP' | 'DOWN' | 'UNKNOWN' = 'UNKNOWN';

  private state: AiHealthState = {
    status: 'STARTING',
    serviceUrl: '',
    isWarmupEnabled: true,
    intervalSeconds: 255,
    lastCheckedAt: null,
    latencyMs: null,
    httpStatus: null,
    consecutiveFailures: 0,
    message: 'AI Service warmup probe is initializing...',
  };

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const aiUrl = this.getAiServiceUrl();
    const isEnabled = this.isWarmupEnabled();
    const intervalMs = this.getIntervalMs();

    this.state.serviceUrl = aiUrl;
    this.state.isWarmupEnabled = isEnabled;
    this.state.intervalSeconds = Math.round(intervalMs / 1000);

    if (!isEnabled) {
      this.state.status = 'DISABLED';
      this.state.message = 'AI Warmup is disabled via AI_WARMUP_ENABLED=false.';
      this.logger.log('[AI Warmup] AI Service keep-alive warmup is DISABLED.');
      return;
    }

    this.logger.log(
      `[AI Warmup] Initializing AI Service keep-alive probe (Interval: ${this.state.intervalSeconds}s, Target: ${aiUrl})`,
    );

    // Initial check after gateway finishes bootstrap (3s)
    setTimeout(() => {
      void this.ping();
    }, 3000);

    // Schedule regular keep-alive ping
    this.timer = setInterval(() => {
      void this.ping();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getStatus(): AiHealthState {
    return { ...this.state };
  }

  public async probeNow(): Promise<AiHealthState> {
    return await this.ping();
  }

  private async ping(): Promise<AiHealthState> {
    const url = this.getAiServiceUrl();
    const healthUrl = `${url.replace(/\/+$/, '')}/health`;
    const startTime = Date.now();

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HandyGo-Backend-Warmup/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      const latencyMs = Date.now() - startTime;
      const isOk = response.ok;
      let body: Record<string, unknown> | null = null;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = null;
      }

      if (isOk) {
        this.state = {
          status: 'UP',
          serviceUrl: url,
          isWarmupEnabled: this.isWarmupEnabled(),
          intervalSeconds: this.state.intervalSeconds,
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          httpStatus: response.status,
          consecutiveFailures: 0,
          message:
            typeof body?.message === 'string'
              ? body.message
              : 'AI Service is warm, healthy and active.',
          data: body?.data ?? null,
        };

        if (this.previousStatus === 'DOWN') {
          this.logger.log(
            `[AI Warmup] RECOVERY: AI Service is back UP! Latency: ${latencyMs}ms (${url})`,
          );
          void this.sendTelegramAlert(
            `✅ [HANDY_GO] AI Service đã hoạt động trở lại!\n- Latency: ${latencyMs}ms\n- Target: ${url}`,
          );
        } else {
          this.logger.debug(
            `[AI Warmup] Keep-alive probe OK: ${latencyMs}ms (HTTP ${response.status})`,
          );
        }

        this.previousStatus = 'UP';
      } else {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown network error';
      const failures = this.state.consecutiveFailures + 1;

      this.state = {
        status: 'DOWN',
        serviceUrl: url,
        isWarmupEnabled: this.isWarmupEnabled(),
        intervalSeconds: this.state.intervalSeconds,
        lastCheckedAt: new Date().toISOString(),
        latencyMs,
        httpStatus: null,
        consecutiveFailures: failures,
        error: errorMessage,
        message: `Failed to connect to AI Service: ${errorMessage}`,
      };

      this.logger.warn(
        `[AI Warmup] Health ping failed (Fail count: ${failures}): ${errorMessage} - Target: ${healthUrl}`,
      );

      // Alert on first failure or every 5 consecutive failures
      if (this.previousStatus !== 'DOWN' || failures % 5 === 0) {
        void this.sendTelegramAlert(
          `⚠️ [HANDY_GO Alert] AI Service không phản hồi!\n- Lỗi: ${errorMessage}\n- Lần thử thất bại: ${failures}\n- URL: ${healthUrl}`,
        );
      }

      this.previousStatus = 'DOWN';
    }

    return { ...this.state };
  }

  private getAiServiceUrl(): string {
    return (
      this.config.get('AI_SERVICE_URL') ||
      process.env.AI_SERVICE_URL ||
      'http://localhost:8000'
    );
  }

  private isWarmupEnabled(): boolean {
    const val =
      this.config.get('AI_WARMUP_ENABLED') || process.env.AI_WARMUP_ENABLED;
    if (val === undefined || val === null || val === '') return true;
    return val.toLowerCase() !== 'false';
  }

  private getIntervalMs(): number {
    const val =
      this.config.get('AI_WARMUP_INTERVAL_MS') ||
      process.env.AI_WARMUP_INTERVAL_MS;
    const num = Number(val);
    return !Number.isNaN(num) && num >= 30000 ? num : 255000;
  }

  private async sendTelegramAlert(message: string): Promise<void> {
    const botToken =
      this.config.get('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN;
    const chatId =
      this.config.get('TELEGRAM_CHAT_ID') || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return;
    }

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Failed to send Telegram alert: ${errMsg}`);
    }
  }
}

