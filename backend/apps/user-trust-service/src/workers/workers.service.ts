import { BadRequestException, Injectable } from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';
import { Prisma } from '@prisma/user-trust-client';
import type { DashboardWorkerCandidateDto } from './dto/dashboard-worker-ranking.dto.js';

@Injectable()
export class WorkersService {
  constructor(private readonly db: UserTrustPrismaService) {}

  async getSummaries(ids: string[]) {
    const workers = await this.db.workerProfile.findMany({
      where: { userId: { in: [...new Set(ids)] }, user: { status: 'active' } },
      select: {
        userId: true,
        averageRating: true,
        ratingCount: true,
        completedOrderCount: true,
        user: { select: { fullName: true, avatarUrl: true } },
      },
    });
    return workers.map((worker) => ({
      workerId: worker.userId,
      fullName: worker.user.fullName,
      avatarUrl: worker.user.avatarUrl,
      averageRating:
        worker.ratingCount > 0 ? Number(worker.averageRating) : null,
      ratingCount: worker.ratingCount,
      completedOrderCount: worker.completedOrderCount,
    }));
  }

  async getDashboardSummaries(ids: string[]) {
    const workers = await this.db.workerProfile.findMany({
      where: { userId: { in: [...new Set(ids)] } },
      select: {
        userId: true,
        averageRating: true,
        user: { select: { fullName: true, avatarUrl: true } },
      },
    });
    return workers.map((worker) => ({
      workerUserId: worker.userId,
      fullName: worker.user.fullName,
      avatarUrl: worker.user.avatarUrl,
      averageRating: Number(worker.averageRating),
    }));
  }

  async rankDashboardWorkers(candidates: DashboardWorkerCandidateDto[]) {
    if (
      new Set(candidates.map((row) => row.workerUserId.toLowerCase())).size !==
      candidates.length
    ) {
      throw new BadRequestException('Duplicate dashboard worker IDs');
    }
    // Only this service reads its profile tables. Bind the entire candidate set
    // as one JSON parameter, avoiding a parameter or HTTP request per worker.
    const schema = `"${this.db.schema.replaceAll('"', '""')}"`;
    return this.db.$queryRaw<
      {
        workerUserId: string;
        completedOrderCount: number;
        fullName: string;
        avatarUrl: string | null;
        averageRating: number | null;
      }[]
    >(Prisma.sql`
      WITH candidates AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb)
          AS entry("workerUserId" uuid, "completedOrderCount" integer)
      )
      SELECT c."workerUserId", c."completedOrderCount",
        COALESCE(u.full_name, 'Thợ không còn hồ sơ') AS "fullName",
        u.avatar_url AS "avatarUrl", w.average_rating::float8 AS "averageRating"
      FROM candidates c
      LEFT JOIN ${Prisma.raw(`${schema}."worker_profiles"`)} w ON w.user_id = c."workerUserId"
      LEFT JOIN ${Prisma.raw(`${schema}."users"`)} u ON u.id = w.user_id
      ORDER BY c."completedOrderCount" DESC, w.average_rating DESC NULLS LAST,
        c."workerUserId" ASC
      LIMIT 5
    `);
  }
}
