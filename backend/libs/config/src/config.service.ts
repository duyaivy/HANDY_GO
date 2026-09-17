import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService) {}

  get serviceName(): string {
    return this.config.getOrThrow<string>('SERVICE_NAME');
  }

  get port(): number {
    return Number(this.config.getOrThrow<string>('PORT'));
  }

  get apiPrefix(): string {
    return this.config.getOrThrow<string>('API_PREFIX');
  }

  get corsOrigins(): string[] {
    return this.config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get upstreamTimeoutMs(): number {
    return Number(this.config.getOrThrow<string>('UPSTREAM_TIMEOUT_MS'));
  }

  getUrl(key: string): string {
    return this.config.getOrThrow<string>(key);
  }
}
