import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

@Injectable()
export class ApiGatewayService {
  constructor(private readonly config: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getAuthHealth(requestId?: string): Promise<unknown> {
    const upstreamUrl = new URL(
      '/health',
      this.config.getUrl('AUTH_SERVICE_URL'),
    );

    try {
      const response = await fetch(upstreamUrl, {
        headers: requestId ? { 'x-request-id': requestId } : undefined,
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
      });

      if (!response.ok) {
        throw new BadGatewayException({
          statusCode: 502,
          message: `Auth service returned HTTP ${response.status}`,
          upstream: 'auth-service',
        });
      }

      return await response.json();
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new GatewayTimeoutException({
          statusCode: 504,
          message: 'Auth service request timed out',
          upstream: 'auth-service',
        });
      }
      throw new BadGatewayException({
        statusCode: 502,
        message: 'Auth service is unavailable',
        upstream: 'auth-service',
      });
    }
  }
}
