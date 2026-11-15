import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import { MessagePrisma } from './persistence.js';
import { AuthorityClient } from './authority.js';
import { createMessageApp } from './application.js';

async function main() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const port = Number(process.env.PORT ?? process.env.MESSAGE_PORT ?? 3009);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid MESSAGE_PORT');
  const authority = new AuthorityClient({
    secret: required('INTERNAL_SERVICE_SECRET'),
    bidding: required('BIDDING_SERVICE_URL'),
    order: required('ORDER_SERVICE_URL'),
    auth: required('AUTH_SERVICE_URL'),
    media: required('MEDIA_SERVICE_URL'),
    userTrust: process.env.USER_TRUST_SERVICE_URL?.trim() || undefined,
    catalog: process.env.CATALOG_SERVICE_URL?.trim() || undefined,
  });
  const cursorSecret = required('MESSAGE_CURSOR_SECRET'),
    brokerUrl = required('RABBITMQ_URL');
  const db = new MessagePrisma();
  let app: NestExpressApplication | undefined;
  try {
    await db.$connect();
    app = await createMessageApp({
      db,
      authority,
      verifier: new TokenVerifierService(new JwtService()),
      cursorSecret,
      origins: (process.env.CORS_ORIGIN ?? 'http://localhost:8081')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      brokerUrl,
    });
    await app.listen(port, process.env.MESSAGE_HOST ?? '0.0.0.0');
  } catch (error) {
    if (app) await app.close();
    else await db.$disconnect();
    throw error;
  }
}
void main().catch(() => {
  console.error(
    'Message Service startup failed; check explicit service configuration and dependencies',
  );
  process.exitCode = 1;
});
