// Run with old tracking consumers/schedulers stopped. Never log payloads or URLs.
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/tracking-client';
import { PrismaPg } from '@prisma/adapter-pg';
const apply = process.argv.includes('--apply');
if (!process.env.REDIS_URL || !process.env.DATABASE_URL_TRACKING) throw new Error('REDIS_URL and DATABASE_URL_TRACKING are required');
const redis = new Redis(process.env.REDIS_URL);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TRACKING }) });
let copied = 0;
try {
  for (const pattern of ['tracking:{pending}:order_events:*', 'tracking:pending_order_events:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      for (const key of keys) {
        if (!apply) { copied += await redis.llen(key); continue; }
        const orderId = key.slice(key.lastIndexOf(':') + 1);
        for (;;) {
          const serialized = await redis.lindex(key, 0);
          if (serialized === null) break;
          const { data, forcedEventType } = JSON.parse(serialized);
          const payload = data.payload || data;
          const eventId = data.eventId || data.id || payload.eventId || payload.id;
          if (!eventId) throw new Error('Legacy pending entry has no stable ID; retained for manual repair');
          const eventType = forcedEventType || data.eventType || payload.eventType;
          await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${String(eventId)}, 0))::text`;
            if (await tx.consumedEvent.findUnique({ where: { eventId: String(eventId) } })) return;
            await tx.pendingTrackingEvent.upsert({
              where: { eventId: String(eventId) }, update: {},
              create: { eventId: String(eventId), orderId, eventType, envelope: data },
            });
          });
          const removed = await redis.eval('if redis.call("LINDEX", KEYS[1], 0) == ARGV[1] then return redis.call("LPOP", KEYS[1]) end', 1, key, serialized);
          if (removed !== serialized) throw new Error('Queue changed concurrently; stop legacy consumers and retry');
          copied++;
        }
      }
    } while (cursor !== '0');
  }
  console.log(JSON.stringify({ apply, entries: copied }));
} finally { await db.$disconnect(); await redis.quit(); }
