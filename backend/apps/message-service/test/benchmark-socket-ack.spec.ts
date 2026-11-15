import { describe, it } from 'vitest';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { io } from 'socket.io-client';
import { JwtService } from '@nestjs/jwt';
import { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../../../libs/auth/src/auth.constants.js';
import { createMessageApp } from '../../../apps/message-service/src/application.js';
import { MessagePrisma } from '../../../apps/message-service/src/persistence.js';
import { AuthorityClient } from '../../../apps/message-service/src/authority.js';

const dbUrl =
  process.env.MESSAGE_BENCHMARK_DATABASE_URL ||
  process.env.MESSAGE_TEST_DATABASE_URL ||
  process.env.DATABASE_URL;

describe.runIf(Boolean(dbUrl))('Socket.IO ACK Latency Benchmark', () => {
  it('measures p50, p95, p99 on Supabase Seoul', async () => {
    const customer = '9b364a7f-b818-41a6-b0ef-59ff10af8598';
    const worker = '4bb6e3d4-6b59-4ee7-b28a-a4f436234328';
    const requestId = '8ebd6d4d-4d93-4edb-9a3e-50448a190f4a';
    const conversationId = '2f9b1156-dce2-4566-889c-92230dd5a07c';
    const bidId = '75d2384b-cb68-469c-bfc3-2ccc0a821b5e';

    const jwt = new JwtService();
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.JWT_PUBLIC_KEY = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString();

    const token = (userId: string) =>
      jwt.sign(
        { sub: randomUUID(), userId, sid: randomUUID(), roles: [], permissions: [], tokenType: 'access' },
        {
          privateKey: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }),
          algorithm: 'RS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: 3600,
        },
      );

    const db = new MessagePrisma(dbUrl);
    await db.$connect();

    const authority = new AuthorityClient(
      {
        secret: 'handy-go-internal-service-secret-key-12345',
        bidding: 'http://127.0.0.1:3005',
        order: 'http://127.0.0.1:3004',
        auth: 'http://127.0.0.1:3001',
        media: 'http://127.0.0.1:3000',
      },
      async (url) => {
        const path = String(url);
        if (path.includes('/chat-session')) {
          return new Response(JSON.stringify({ data: { active: true } }));
        }
        if (path.includes('/chat-lookup') || path.includes('/bids/')) {
          return new Response(
            JSON.stringify({
              data: {
                bidId,
                requestId,
                workerId: worker,
                status: 'active',
                eligible: true,
                validUntil: null,
                roundStatus: 'open',
                version: 1,
                submittedAt: new Date().toISOString(),
                verifiedAt: new Date().toISOString(),
              },
            }),
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              requestId,
              customerId: customer,
              status: 'open_for_bidding',
              order: null,
              version: 1,
              verifiedAt: new Date().toISOString(),
            },
          }),
        );
      },
    );

    const app = await createMessageApp({
      db,
      authority,
      verifier: new TokenVerifierService(jwt),
      cursorSecret: 'b'.repeat(32),
      origins: [],
    });

    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();

    const customerToken = token(customer);
    const socket = io(base, {
      path: '/api/v1/chat/socket.io/',
      transports: ['websocket'],
      auth: { token: customerToken },
    });

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    // Join conversation
    await socket.emitWithAck('conversation.join', { conversationId });

    const ackTimes: number[] = [];
    const N = 25;

    for (let i = 0; i < N; i++) {
      const clientMessageId = randomUUID();
      const t0 = performance.now();
      const res: any = await socket.timeout(5000).emitWithAck('message.send', {
        conversationId,
        clientMessageId,
        messageType: 'TEXT',
        content: `Bench message #${i + 1}`,
      });
      const duration = performance.now() - t0;
      ackTimes.push(duration);
      if (!res.ok) {
        console.error(`Message ${i + 1} failed:`, res.error);
      }
    }

    // Measure retries
    const retryTimes: number[] = [];
    const testMsgId = randomUUID();
    await socket.emitWithAck('message.send', {
      conversationId,
      clientMessageId: testMsgId,
      messageType: 'TEXT',
      content: 'Retry test message',
    });

    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res: any = await socket.timeout(5000).emitWithAck('message.send', {
        conversationId,
        clientMessageId: testMsgId,
        messageType: 'TEXT',
        content: 'Retry test message',
      });
      retryTimes.push(performance.now() - t0);
    }

    ackTimes.sort((a, b) => a - b);
    const p50 = ackTimes[Math.floor(ackTimes.length * 0.5)].toFixed(1);
    const p90 = ackTimes[Math.floor(ackTimes.length * 0.9)].toFixed(1);
    const p95 = ackTimes[Math.floor(ackTimes.length * 0.95)].toFixed(1);
    const p99 = ackTimes[Math.floor(ackTimes.length * 0.99)].toFixed(1);
    const min = Math.min(...ackTimes).toFixed(1);
    const max = Math.max(...ackTimes).toFixed(1);
    const avg = (ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length).toFixed(1);

    const retryAvg = (retryTimes.reduce((a, b) => a + b, 0) / retryTimes.length).toFixed(1);

    console.log('\n======================================================');
    console.log('SOCKET.IO MESSAGE SEND LATENCY BENCHMARK (AFTER OPTIMIZATION)');
    console.log('Database: Supabase AWS Seoul (aws-0-ap-northeast-2.pooler.supabase.com)');
    console.log('======================================================');
    console.log(`Samples:     ${N}`);
    console.log(`Min:         ${min} ms`);
    console.log(`Avg:         ${avg} ms`);
    console.log(`p50:         ${p50} ms`);
    console.log(`p90:         ${p90} ms`);
    console.log(`p95:         ${p95} ms`);
    console.log(`p99:         ${max} ms`);
    console.log(`Max:         ${max} ms`);
    console.log(`Rapid Retry Avg Latency: ${retryAvg} ms`);
    console.log('======================================================\n');

    socket.disconnect();
    await app.close();
    await db.$disconnect();
  }, 30000);
});
