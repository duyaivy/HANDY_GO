import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@app/config';

@Injectable()
export class ApiGatewayService {
  constructor(private readonly config: ConfigService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async forwardRequest(
    serviceKey: 'AUTH_SERVICE_URL' | 'USER_TRUST_SERVICE_URL',
    path: string,
    method: string,
    headers: {
      authorization?: string;
      'x-request-id'?: string;
      'x-forwarded-for'?: string;
      'user-agent'?: string;
      [key: string]: string | undefined;
    },
    body?: unknown,
  ): Promise<unknown> {
    const baseUrl = this.config.getUrl(serviceKey);
    const upstreamUrl = new URL(path, baseUrl);

    const forwardHeaders: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (headers.authorization) {
      forwardHeaders.authorization = headers.authorization;
    }
    if (headers['x-request-id']) {
      forwardHeaders['x-request-id'] = headers['x-request-id'];
    }
    if (headers['x-forwarded-for']) {
      forwardHeaders['x-forwarded-for'] = headers['x-forwarded-for'];
    }
    if (headers['user-agent']) {
      forwardHeaders['user-agent'] = headers['user-agent'];
    }

    try {
      const response = await fetch(upstreamUrl, {
        method,
        headers: forwardHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new HttpException(responseData, response.status);
      }

      return responseData;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new GatewayTimeoutException({
          statusCode: 504,
          message: 'Upstream service request timed out',
        });
      }
      throw new BadGatewayException({
        statusCode: 502,
        message: 'Upstream service is unavailable',
      });
    }
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
