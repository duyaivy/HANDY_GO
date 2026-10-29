import { Injectable } from '@nestjs/common';
import { UserTrustPrismaService } from '@app/database';

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
}
