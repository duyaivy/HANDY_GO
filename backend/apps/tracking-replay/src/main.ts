import { isUUID } from 'class-validator';
import { PrismaService } from '../../tracking-service/src/common/prisma/prisma.service.js';
import { TrackingEventsService } from '../../tracking-service/src/events/tracking-events.service.js';

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const eventId = option('--event-id');
const serviceRequestId = option('--service-request-id');
const apply = args.includes('--apply');

if (!process.env.DATABASE_URL_TRACKING) {
  throw new Error('DATABASE_URL_TRACKING is required');
}
if (!eventId || eventId.length > 128 || (serviceRequestId && !isUUID(serviceRequestId))) {
  throw new Error('Use --event-id <id> [--service-request-id <uuid>] [--apply]');
}

const db = new PrismaService();
try {
  await db.$connect();
  const rejected = await db.rejectedTrackingEvent.findUnique({ where: { eventId } });
  if (!rejected) throw new Error('REJECTED_EVENT_NOT_FOUND');
  if (!apply) {
    console.log(JSON.stringify({
      eventId,
      eventType: rejected.eventType,
      reason: rejected.reason,
      receivedAt: rejected.receivedAt,
      resolvedAt: rejected.resolvedAt,
      truncated: (rejected.envelope as { truncated?: boolean })?.truncated === true,
      replayServiceRequestId: serviceRequestId ?? null,
      dryRun: true,
    }));
  } else {
    const result = await new TrackingEventsService(db).replayRejectedEvent(eventId, serviceRequestId);
    console.log(JSON.stringify({ eventId, ...result }));
    if (!result.recorded && !['ALREADY_CONSUMED', 'IDEMPOTENT_DUPLICATE', 'ALREADY_RESOLVED'].includes(result.reason ?? '')) {
      process.exitCode = 1;
    }
  }
} finally {
  await db.$disconnect();
}
