import { Injectable, Logger } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';
import type { RankedWorkerOutput } from '../ranking/ranking.dto.js';

export class MatchRunBusyError extends Error {
  constructor() {
    super('Matching run already leased by another worker');
  }
}

@Injectable()
export class MatchRunRepository {
  private readonly logger = new Logger(MatchRunRepository.name);

  constructor(private readonly prisma: MatchingPrismaService) {}

  /**
   * Finds or creates a MatchRun record for the specified request, revision, and run number.
   */
  async createOrGetRun(params: {
    serviceRequestId: string;
    serviceId: string;
    requestRevision: number;
    runNumber?: number;
    displayLimit?: number;
  }): Promise<MatchingPrisma.MatchRun> {
    const {
      serviceRequestId,
      serviceId,
      requestRevision,
      runNumber = 1,
      displayLimit = 5,
    } = params;

    return this.prisma.matchRun.upsert({
      where: {
        serviceRequestId_requestRevision_runNumber: {
          serviceRequestId,
          requestRevision,
          runNumber,
        },
      },
      create: {
        serviceRequestId,
        serviceId,
        requestRevision,
        runNumber,
        status: 'pending',
        displayLimit,
      },
      update: {},
    });
  }

  async claimRun(
    runId: string,
    attemptToken: string,
    deadline: Date,
  ): Promise<boolean> {
    const claimed = await this.prisma.matchRun.updateMany({
      where: {
        id: runId,
        status: { not: 'completed' },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }],
      },
      data: {
        status: 'processing',
        attemptToken,
        leaseExpiresAt: deadline,
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      },
    });
    return claimed.count === 1;
  }

  /**
   * Persists ranked results (up to Top 20) inside a database transaction,
   * performs stale revision verification, updates MatchRun to completed,
   * and records the matching.completed domain event in the Outbox.
   */
  async persistMatchResults(params: {
    matchRunId: string;
    attemptToken: string;
    signal?: AbortSignal;
    eligibleWorkerIds?: string[];
    serviceRequestId: string;
    requestRevision: number;
    candidateCount: number;
    results: RankedWorkerOutput[];
    modelVersion: string;
    outboxPayload: any;
  }): Promise<{ isStaleRevision: boolean; savedResultCount: number }> {
    const {
      matchRunId,
      serviceRequestId,
      requestRevision,
      candidateCount,
      results,
      modelVersion,
      outboxPayload,
    } = params;

    return this.prisma.$transaction(async (tx) => {
      params.signal?.throwIfAborted();
      // This conditional UPDATE takes the row lock before any result/outbox writes.
      // A stale attempt or a parallel completion cannot pass this fence.
      const claimed = await tx.matchRun.updateMany({
        where: {
          id: matchRunId,
          status: 'processing',
          attemptToken: params.attemptToken,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { status: 'completed' },
      });
      if (claimed.count !== 1) throw new Error('Matching execution lease lost');
      const projectionTable = MatchingPrisma.Prisma.raw(
        `"${this.prisma.schema.replaceAll('"', '""')}"."service_request_projections"`,
      );
      await tx.$queryRaw(MatchingPrisma.Prisma
        .sql`SELECT id FROM ${projectionTable}
        WHERE id = ${serviceRequestId}::uuid FOR SHARE`);
      const projection = await tx.serviceRequestProjection.findUnique({
        where: { id: serviceRequestId },
      });
      if (
        !projection ||
        projection.matchingRevision !== requestRevision ||
        !['open_for_bidding', 'bidding_closed'].includes(projection.status) ||
        (projection.selectionExpiresAt &&
          projection.selectionExpiresAt.getTime() <= Date.now())
      ) {
        throw new Error(
          'Matching request revision or lifecycle is no longer available',
        );
      }

      // 1. Revision Protection: Check if a newer revision has already completed
      const newerCompletedRun = await tx.matchRun.findFirst({
        where: {
          serviceRequestId,
          requestRevision: { gt: requestRevision },
          status: 'completed',
        },
      });

      const isStaleRevision = !!newerCompletedRun;
      if (isStaleRevision) {
        this.logger.warn(
          `Match run ${matchRunId} (rev ${requestRevision}) completed AFTER newer rev ${newerCompletedRun.requestRevision}. Preserving for history but flagging as stale.`,
        );
      }

      // 2. Persist up to Top 20 results
      const resultsToPersist = results.slice(0, 20);

      // Clean existing results for this run if any (idempotent re-run)
      await tx.matchResult.deleteMany({
        where: { matchRunId },
      });

      if (resultsToPersist.length > 0) {
        await tx.matchResult.createMany({
          data: resultsToPersist.map((r) => ({
            matchRunId,
            workerUserId: r.workerUserId,
            rank: r.rank,
            matchingScore: r.matchingScore,
            scoreBreakdown: r.scoreBreakdown as any,
          })),
        });
      }

      // 3. Mark MatchRun as completed
      await tx.matchRun.update({
        where: { id: matchRunId },
        data: {
          status: 'completed',
          candidateCount,
          resultCount: resultsToPersist.length,
          modelVersion,
          completedAt: new Date(),
        },
      });

      // 4. Record transactional Outbox event
      const finalPayload =
        typeof outboxPayload === 'function'
          ? outboxPayload(isStaleRevision)
          : { ...outboxPayload, isStaleRevision };

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'MatchRun',
          aggregateId: matchRunId,
          eventType: 'matching.completed',
          payload: finalPayload,
        },
      });

      // Notification consumes bounded chunks; event IDs are stable across outbox retries.
      const workers = [...new Set(params.eligibleWorkerIds ?? [])];
      if (
        !isStaleRevision &&
        projection.status === 'open_for_bidding' &&
        (!projection.biddingClosesAt ||
          projection.biddingClosesAt.getTime() > Date.now())
      ) {
        for (let offset = 0; offset < workers.length; offset += 100) {
          const eventId = crypto.randomUUID();
          await tx.outboxEvent.create({
            data: {
              id: eventId,
              aggregateType: 'MatchRun',
              aggregateId: matchRunId,
              eventType: 'matching.eligible_workers.ready',
              payload: {
                eventId,
                eventType: 'matching.eligible_workers.ready',
                eventVersion: 1,
                source: 'matching-service',
                occurredAt: new Date().toISOString(),
                data: {
                  requestId: serviceRequestId,
                  matchingRunId: matchRunId,
                  chunkId: crypto.randomUUID(),
                  eligibleWorkerIds: workers.slice(offset, offset + 100),
                },
              },
            },
          });
        }
      }
      params.signal?.throwIfAborted();
      // Use wall-clock time, not PostgreSQL's transaction-start timestamp.
      const table = MatchingPrisma.Prisma.raw(
        `"${this.prisma.schema.replaceAll('"', '""')}"."match_runs"`,
      );
      const valid = await tx.$queryRaw<Array<{ id: string }>>(MatchingPrisma
        .Prisma.sql`
        SELECT id FROM ${table} WHERE id = ${matchRunId}::uuid
          AND attempt_token = ${params.attemptToken}::uuid
          AND lease_expires_at > clock_timestamp()`);
      if (valid.length !== 1)
        throw new Error('Matching execution deadline exceeded');
      return { isStaleRevision, savedResultCount: resultsToPersist.length };
    });
  }

  /**
   * Marks a MatchRun as failed and records the matching.failed Outbox event.
   */
  async failMatchRun(params: {
    matchRunId: string;
    errorMessage: string;
    attemptToken: string;
    outboxPayload: any;
  }): Promise<void> {
    const { matchRunId, errorMessage, outboxPayload } = params;

    await this.prisma.$transaction(async (tx) => {
      const failed = await tx.matchRun.updateMany({
        where: {
          id: matchRunId,
          status: 'processing',
          attemptToken: params.attemptToken,
        },
        data: {
          status: 'failed',
          leaseExpiresAt: null,
          attemptToken: null,
          errorMessage,
          completedAt: new Date(),
        },
      });

      if (failed.count !== 1) return;
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'MatchRun',
          aggregateId: matchRunId,
          eventType: 'matching.failed',
          payload: outboxPayload,
        },
      });
    });
  }

  /**
   * Retrieves the latest completed MatchRun and its results for a Service Request.
   */
  async getLatestCompletedRun(serviceRequestId: string): Promise<
    | (MatchingPrisma.MatchRun & {
        results: MatchingPrisma.MatchResult[];
      })
    | null
  > {
    return this.prisma.matchRun.findFirst({
      where: {
        serviceRequestId,
        status: 'completed',
      },
      include: {
        results: {
          orderBy: { rank: 'asc' },
        },
      },
      orderBy: [
        { requestRevision: 'desc' },
        { runNumber: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Retrieves any latest MatchRun (pending, processing, completed, or failed).
   */
  async getLatestRun(serviceRequestId: string): Promise<
    | (MatchingPrisma.MatchRun & {
        results: MatchingPrisma.MatchResult[];
      })
    | null
  > {
    return this.prisma.matchRun.findFirst({
      where: { serviceRequestId },
      include: {
        results: {
          orderBy: { rank: 'asc' },
        },
      },
      orderBy: [
        { requestRevision: 'desc' },
        { runNumber: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Retrieves a specific MatchResult by ID including its parent MatchRun.
   */
  async getResultById(resultId: string): Promise<
    | (MatchingPrisma.MatchResult & {
        matchRun: MatchingPrisma.MatchRun;
      })
    | null
  > {
    return this.prisma.matchResult.findUnique({
      where: { id: resultId },
      include: { matchRun: true },
    });
  }
}
