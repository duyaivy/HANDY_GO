import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@app/config';

describe('Bidding Service Compose Configuration & Startup Validation', () => {
  describe('Docker Compose Configuration', () => {
    it('declares USER_TRUST_SERVICE_URL and ORDER_SERVICE_URL for bidding-service', () => {
      const candidatePaths = [
        path.resolve(process.cwd(), 'docker-compose.yml'),
        path.resolve(process.cwd(), 'backend/docker-compose.yml'),
        path.resolve(process.cwd(), '../docker-compose.yml'),
      ];
      const composePath = candidatePaths.find((p) => fs.existsSync(p));
      expect(composePath).toBeDefined();

      const content = fs.readFileSync(composePath!, 'utf8');

      // Match the service block for "bidding-service:" under "services:"
      const biddingServiceMatch = content.match(/\n\s{2}bidding-service:\s*[\s\S]*?(?=\n\s{2}[a-z0-9_-]+:|$)/);
      expect(biddingServiceMatch).not.toBeNull();
      const biddingBlock = biddingServiceMatch![0];

      // Verify ORDER_SERVICE_URL
      expect(biddingBlock).toMatch(/ORDER_SERVICE_URL:\s*http:\/\/order-service:3004/);

      // Verify USER_TRUST_SERVICE_URL
      expect(biddingBlock).toMatch(/USER_TRUST_SERVICE_URL:\s*http:\/\/user-trust-service:3002/);

      // Verify PORT 3005
      expect(biddingBlock).toMatch(/PORT:\s*'?3005'?/);
    });
  });

  describe('Startup Fail-Fast Validation (ConfigModule)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('INTERNAL_SERVICE_SECRET', 'test-internal-secret');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('fails startup validation when USER_TRUST_SERVICE_URL is missing', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', 'http://order-service:3004');
      vi.stubEnv('USER_TRUST_SERVICE_URL', ' ');

      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              serviceName: 'bidding-service',
              defaultPort: 3005,
              requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
              requiredKeys: ['INTERNAL_SERVICE_SECRET'],
            }),
          ],
        }).compile(),
      ).rejects.toThrow('USER_TRUST_SERVICE_URL is required');
    });

    it('fails startup validation when USER_TRUST_SERVICE_URL is not a valid URL', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', 'http://order-service:3004');
      vi.stubEnv('USER_TRUST_SERVICE_URL', 'invalid-not-a-url');

      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              serviceName: 'bidding-service',
              defaultPort: 3005,
              requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
              requiredKeys: ['INTERNAL_SERVICE_SECRET'],
            }),
          ],
        }).compile(),
      ).rejects.toThrow('USER_TRUST_SERVICE_URL must be a valid URL');
    });

    it('fails startup validation when ORDER_SERVICE_URL is missing', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', ' ');
      vi.stubEnv('USER_TRUST_SERVICE_URL', 'http://user-trust-service:3002');

      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              serviceName: 'bidding-service',
              defaultPort: 3005,
              requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
              requiredKeys: ['INTERNAL_SERVICE_SECRET'],
            }),
          ],
        }).compile(),
      ).rejects.toThrow('ORDER_SERVICE_URL is required');
    });

    it('succeeds startup validation when all required URLs and keys are present', async () => {
      vi.stubEnv('ORDER_SERVICE_URL', 'http://order-service:3004');
      vi.stubEnv('USER_TRUST_SERVICE_URL', 'http://user-trust-service:3002');

      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            serviceName: 'bidding-service',
            defaultPort: 3005,
            requiredUrls: ['ORDER_SERVICE_URL', 'USER_TRUST_SERVICE_URL'],
            requiredKeys: ['INTERNAL_SERVICE_SECRET'],
          }),
        ],
      }).compile();

      expect(module).toBeDefined();
    });
  });
});
