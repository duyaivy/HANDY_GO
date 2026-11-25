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
  public static readonly MIN_INTERVAL_MS = 10000; // 10s
  public static readonly MAX_INTERVAL_MS = 3600000; // 1 hour
  public static readonly DEFAULT_INTERVAL_MS = 255000; // 255s (4m15s)
  public static readonly PROBE_COOLDOWN_MS = 3000; // 3s cooldown for manual probe
  public static readonly PROBE_TIMEOUT_MS = 10000; // 10s HTTP timeout

  private readonly logger = new Logger(AiWarmupService.name);
  private initialTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private activeAbortController: AbortController | null = null;

  private inFlightProbe: Promise<AiHealthState> | null = null;
  private lastProbeCompletedAt = 0;
  private probeSequence = 0;
  private lastAppliedSequence = 0;
  private previousStatus: 'UP' | 'DOWN' | 'UNKNOWN' = 'UNKNOWN';

  private state: AiHealthState = {
    status: 'STARTING',
    serviceUrl: '',
    isWarmupEnabled: false,
    intervalSeconds: 255,
    lastCheckedAt: null,
    latencyMs: null,
    httpStatus: null,
    consecutiveFailures: 0,
    message: 'AI Service warmup probe is initializing...',
  };

  constructor(private readonly config: ConfigService) { }

  onModuleInit(): void {
    const aiUrl = this.getAiServiceUrl();
    const isEnabled = this.isWarmupEnabled();
    const intervalMs = this.getIntervalMs();

    this.state.serviceUrl = aiUrl;
    this.state.isWarmupEnabled = isEnabled;
    this.state.intervalSeconds = Math.round(intervalMs / 1000);

    if (!isEnabled) {
      this.state.status = 'DISABLED';
      this.state.message =
        'AI Warmup is disabled (opt-in via AI_WARMUP_ENABLED=true).';
      this.logger.log(
        '[AI Warmup] AI Service keep-alive warmup is DISABLED (opt-in).',
      );
      return;
    }

    this.logger.log(
      `[AI Warmup] Initializing AI Service keep-alive probe (Interval: ${this.state.intervalSeconds}s, Target: ${aiUrl})`,
    );

    // Initial check after gateway finishes bootstrap (3s)
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      if (!this.isDestroyed) {
        void this.ping();
      }
    }, 3000);

    // Schedule regular keep-alive ping
    this.intervalTimer = setInterval(() => {
      if (!this.isDestroyed) {
        void this.ping();
      }
    }, intervalMs);
  }

  onModuleDestroy(): void {
    this.isDestroyed = true;
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  public getStatus(): AiHealthState {
    return { ...this.state };
  }

  public async probeNow(): Promise<AiHealthState> {
    const now = Date.now();
    // If a probe is currently in-flight, reuse it (single-flight)
    if (this.inFlightProbe) {
      return await this.inFlightProbe;
    }
    // If called within cooldown window and valid state exists, return cached state
    if (
      now - this.lastProbeCompletedAt < AiWarmupService.PROBE_COOLDOWN_MS &&
      this.state.lastCheckedAt !== null
    ) {
      return { ...this.state };
    }
    return await this.ping();
  }

  private async ping(): Promise<AiHealthState> {
    if (this.inFlightProbe) {
      return await this.inFlightProbe;
    }
    this.inFlightProbe = this.executeProbe();
    try {
      return await this.inFlightProbe;
    } finally {
      this.inFlightProbe = null;
      this.lastProbeCompletedAt = Date.now();
    }
  }

  private async executeProbe(): Promise<AiHealthState> {
    if (this.isDestroyed) {
      return { ...this.state };
    }

    const seq = ++this.probeSequence;
    const url = this.getAiServiceUrl();
    const healthUrl = `${url.replace(/\/+$/, '')}/health`;
    const startTime = Date.now();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Connection timeout')),
      AiWarmupService.PROBE_TIMEOUT_MS,
    );

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HandyGo-Backend-Warmup/1.0',
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      let body: Record<string, unknown> | null = null;
      let isHealthy = false;
      let failureReason: string | null = null;

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          failureReason = `Expected application/json response but received: ${contentType || 'empty'}`;
        } else {
          try {
            body = (await response.json()) as Record<string, unknown>;
            const statusStr = String(body?.status || '').toLowerCase();
            if (statusStr === 'healthy' || statusStr === 'ok') {
              isHealthy = true;
            } else {
              failureReason = `AI Health returned non-healthy status: '${body?.status ?? 'missing'}'`;
            }
          } catch (parseErr) {
            failureReason = `Malformed JSON in AI health response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
          }
        }
      } else {
        failureReason = `HTTP ${response.status} ${response.statusText}`;
      }

      if (this.isDestroyed || seq < this.lastAppliedSequence) {
        return { ...this.state };
      }
      this.lastAppliedSequence = seq;

      if (isHealthy) {
        this.state = {
          status: 'UP',
          serviceUrl: url,
          isWarmupEnabled: this.isWarmupEnabled(),
          intervalSeconds: this.state.intervalSeconds,
          lastCheckedAt: new Date().toISOString(),
          latencyMs,
          httpStatus: response.status,
          consecutiveFailures: 0,
          message: 'AI Service liveness check OK (HTTP 200).',
          data: body?.data ?? body ?? null,
        };

        if (this.previousStatus === 'DOWN') {
          this.logger.log(
            `[AI Warmup] RECOVERY: AI Service is back UP! Latency: ${latencyMs}ms (${url})`,
          );
          const safeUrl = this.escapeHtml(url);
          void this.sendTelegramAlert(
            `✅ <b>[HANDY_GO]</b> AI Service đã hoạt động trở lại!\n• Latency: <code>${latencyMs}ms</code>\n• Target: <code>${safeUrl}</code>`,
          );
        } else {
          this.logger.debug(
            `[AI Warmup] Keep-alive probe OK: ${latencyMs}ms (HTTP ${response.status})`,
          );
        }

        this.previousStatus = 'UP';
      } else {
        throw new Error(failureReason || 'AI health check validation failed');
      }
    } catch (err: unknown) {
      if (this.isDestroyed || seq < this.lastAppliedSequence) {
        return { ...this.state };
      }
      this.lastAppliedSequence = seq;

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

      if (this.previousStatus !== 'DOWN' || failures % 5 === 0) {
        const safeErr = this.escapeHtml(errorMessage);
        const safeUrl = this.escapeHtml(healthUrl);
        void this.sendTelegramAlert(
          `⚠️ <b>[HANDY_GO Alert]</b> AI Service không phản hồi!\n• Lỗi: <code>${safeErr}</code>\n• Lần thử thất bại: <b>${failures}</b>\n• URL: <code>${safeUrl}</code>`,
        );
      }

      this.previousStatus = 'DOWN';
    } finally {
      clearTimeout(timeoutId);
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
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
    if (val === undefined || val === null || val === '') return false;
    return String(val).toLowerCase() === 'true' || String(val) === '1';
  }

  private getIntervalMs(): number {
    const val =
      this.config.get('AI_WARMUP_INTERVAL_MS') ||
      process.env.AI_WARMUP_INTERVAL_MS;
    if (val === undefined || val === null || val === '') {
      return AiWarmupService.DEFAULT_INTERVAL_MS;
    }
    const num = Number(val);
    if (
      Number.isSafeInteger(num) &&
      num >= AiWarmupService.MIN_INTERVAL_MS &&
      num <= AiWarmupService.MAX_INTERVAL_MS
    ) {
      return num;
    }
    return AiWarmupService.DEFAULT_INTERVAL_MS;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        this.logger.warn(
          `[AI Warmup] Telegram alert API responded with HTTP ${res.status}: ${errBody}`,
        );
        return;
      }

      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        description?: string;
      } | null;
      if (json && json.ok === false) {
        this.logger.warn(
          `[AI Warmup] Telegram alert API returned failure: ${json.description || 'Unknown error'}`,
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[AI Warmup] Failed to send Telegram alert: ${errMsg}`);
    }
  }
}
