import { Injectable, Logger } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';
import type { RankedWorkerOutput } from '../ranking/ranking.dto.js';

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

    const existing = await this.prisma.matchRun.findUnique({
      where: {
        serviceRequestId_requestRevision_runNumber: {
          serviceRequestId,
          requestRevision,
          runNumber,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.matchRun.create({
      data: {
        serviceRequestId,
        serviceId,
        requestRevision,
        runNumber,
        status: 'pending',
        displayLimit,
      },
    });
  }

  /**
   * Updates MatchRun status with atomic timestamp tracking.
   */
  async updateRunStatus(
    runId: string,
    status: MatchingPrisma.MatchRunStatus,
    errorMessage?: string,
  ): Promise<MatchingPrisma.MatchRun> {
    const data: any = { status };
    if (status === 'processing') {
      data.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      data.completedAt = new Date();
    }
    if (errorMessage !== undefined) {
      data.errorMessage = errorMessage;
    }

    return this.prisma.matchRun.update({
      where: { id: runId },
      data,
    });
  }

  /**
   * Persists ranked results (up to Top 20) inside a database transaction,
   * performs stale revision verification, updates MatchRun to completed,
   * and records the matching.completed domain event in the Outbox.
   */
  async persistMatchResults(params: {
    matchRunId: string;
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

      return {
        isStaleRevision,
        savedResultCount: resultsToPersist.length,
      };
    });
  }

  /**
   * Marks a MatchRun as failed and records the matching.failed Outbox event.
   */
  async failMatchRun(params: {
    matchRunId: string;
    errorMessage: string;
    outboxPayload: any;
  }): Promise<void> {
    const { matchRunId, errorMessage, outboxPayload } = params;

    await this.prisma.$transaction(async (tx) => {
      await tx.matchRun.update({
        where: { id: matchRunId },
        data: {
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
        },
      });

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
