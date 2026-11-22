import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@app/config';

@Injectable()
export class AuthClient {
  private readonly logger = new Logger(AuthClient.name);

  constructor(private readonly config: ConfigService) {}

  async getUserPhone(userId: string): Promise<string | null> {
    const raw = this.config.get('AUTH_SERVICE_URL')?.replace(/\/+$/, '');
    if (!raw || !this.config.internalServiceSecret) return null;
    const base = raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
    try {
      const response = await fetch(`${base}/internal/users/${encodeURIComponent(userId)}/contact`, {
        headers: { 'x-internal-secret': this.config.internalServiceSecret },
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs || 5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: { data?: { phone?: string | null } } = await response.json();
      return typeof payload.data?.phone === 'string' ? payload.data.phone : null;
    } catch {
      // Contact lookup must not prevent viewing the rest of the worker profile.
      this.logger.warn('Auth contact lookup unavailable');
      return null;
    }
  }
}
