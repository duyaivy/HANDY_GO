export interface WorkerOrderCount {
  workerUserId: string;
  _count: { id: number };
}

export interface DashboardWorkerSummary {
  workerUserId: string;
  fullName: string;
  avatarUrl: string | null;
  averageRating: number;
}

export function topWorkerCandidates(
  rows: WorkerOrderCount[],
): WorkerOrderCount[] {
  if (rows.length <= 5) return rows;
  const counts = rows.map((row) => row._count.id).sort((a, b) => b - a);
  const fifthCount = counts[4];
  return rows.filter((row) => row._count.id >= fifthCount);
}

export function rankTopWorkers(
  rows: WorkerOrderCount[],
  summaries: DashboardWorkerSummary[],
) {
  const byId = new Map(
    summaries.map((summary) => [summary.workerUserId, summary]),
  );
  return rows
    .map((row) => {
      const summary = byId.get(row.workerUserId);
      return {
        workerUserId: row.workerUserId,
        fullName: summary?.fullName ?? 'Thợ không còn hồ sơ',
        avatarUrl: summary?.avatarUrl ?? null,
        completedOrderCount: row._count.id,
        averageRating: summary?.averageRating ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.completedOrderCount - a.completedOrderCount ||
        (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
        (a.workerUserId < b.workerUserId
          ? -1
          : a.workerUserId > b.workerUserId
            ? 1
            : 0),
    )
    .slice(0, 5);
}
