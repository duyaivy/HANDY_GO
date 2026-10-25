import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@app/config';
import { WorkerProfileSummaryDto } from '../dto/bid-response.dto.js';

interface CachedProfile {
  profile: WorkerProfileSummaryDto;
  expiresAt: number;
}

@Injectable()
export class WorkerProfileEnricherService {
  private readonly logger = new Logger(WorkerProfileEnricherService.name);
  private readonly cache = new Map<string, CachedProfile>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 giây cache

  constructor(@Optional() private readonly config?: ConfigService) {}

  /**
   * Tính khoảng cách đường chim bay giữa 2 toạ độ theo công thức Haversine (km)
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Bán kính Trái Đất (km)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Làm giàu thông tin hồ sơ cho danh sách thợ (Worker IDs).
   * Áp dụng In-Memory Cache và Graceful Degradation (không làm gãy API nếu service bên ngoài gặp sự cố).
   */
  async enrichWorkerProfiles(
    workerIds: string[],
  ): Promise<Map<string, WorkerProfileSummaryDto>> {
    const result = new Map<string, WorkerProfileSummaryDto>();
    if (!workerIds.length) return result;

    const uniqueIds = [...new Set(workerIds)];
    const missingIds: string[] = [];
    const now = Date.now();

    // Cache Eviction: Dọn dẹp các mục hết hạn nếu kích thước cache vượt quá 200
    if (this.cache.size > 200) {
      for (const [key, value] of this.cache.entries()) {
        if (value.expiresAt <= now) {
          this.cache.delete(key);
        }
      }
    }

    // 1. Kiểm tra cache trước
    for (const id of uniqueIds) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > now) {
        result.set(id, cached.profile);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length === 0) {
      return result;
    }

    // 2. Gọi sang User-Trust Service để lấy batch profile
    try {
      const userTrustUrl =
        process.env.USER_TRUST_SERVICE_URL || 'http://user-trust-service:3002';
      const secret =
        this.config?.internalServiceSecret ||
        process.env.INTERNAL_SERVICE_SECRET ||
        'handy-go-internal-service-secret-key-12345';

      const url = `${userTrustUrl.replace(/\/+$/, '')}/api/v1/internal/workers/batch-summary?ids=${missingIds.join(',')}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        signal: AbortSignal.timeout(3000), // Timeout 3s để bảo vệ độ trễ API
      });

      if (response.ok) {
        const data = await response.json();
        const profiles: Array<{
          workerId: string;
          fullName?: string;
          avatarUrl?: string;
          averageRating?: number;
          ratingCount?: number;
          completedOrderCount?: number;
          distanceKm?: number;
        }> = Array.isArray(data) ? data : data.data || [];

        for (const p of profiles) {
          const profileSummary: WorkerProfileSummaryDto = {
            fullName: p.fullName || 'Thợ đối tác',
            avatarUrl: p.avatarUrl || null,
            averageRating: p.averageRating ?? 5.0,
            ratingCount: p.ratingCount ?? 0,
            completedOrderCount: p.completedOrderCount ?? 0,
            distanceKm: p.distanceKm ?? null,
          };

          result.set(p.workerId, profileSummary);
          this.cache.set(p.workerId, {
            profile: profileSummary,
            expiresAt: now + this.CACHE_TTL_MS,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Không thể lấy hồ sơ thợ từ User-Trust Service (${(error as Error).message}). Áp dụng dữ liệu dự phòng (Fallback).`,
      );
    }

    // 3. Với những ID chưa có dữ liệu (chưa đăng ký kyc hoặc service lỗi), tạo default fallback
    for (const id of missingIds) {
      if (!result.has(id)) {
        const fallbackProfile: WorkerProfileSummaryDto = {
          fullName: 'Thợ đối tác HandyGo',
          avatarUrl: null,
          averageRating: 5.0,
          ratingCount: 0,
          completedOrderCount: 0,
          distanceKm: null,
        };
        result.set(id, fallbackProfile);
      }
    }

    return result;
  }
}
