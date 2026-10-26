import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WorkerProfileEnricherService } from './worker-profile-enricher.service.js';

describe('WorkerProfileEnricherService', () => {
  let enricher: WorkerProfileEnricherService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    enricher = new WorkerProfileEnricherService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('nên trả về profile fallback mặc định khi user-trust-service offline / fetch lỗi (Graceful Degradation)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));

    const profiles = await enricher.enrichWorkerProfiles(['worker-uuid-1']);
    const profile = profiles.get('worker-uuid-1');

    expect(profile).toBeDefined();
    expect(profile?.fullName).toContain('Thợ');
    expect(profile?.averageRating).toBeNull();
    expect(profile?.ratingCount).toBe(0);
    expect(profile?.completedOrderCount).toBe(0);
  });

  it('nên làm giàu dữ liệu thành công từ API và lưu vào cache', async () => {
    const mockApiResponse = [
      {
        workerId: 'worker-uuid-123',
        fullName: 'Nguyễn Văn Thợ',
        avatarUrl: 'https://example.com/avatar.jpg',
        averageRating: 4.85,
        ratingCount: 42,
        completedOrderCount: 105,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    } as any);

    // Lần 1: Cache miss -> gọi fetch
    const profiles = await enricher.enrichWorkerProfiles(['worker-uuid-123']);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const profile = profiles.get('worker-uuid-123');
    expect(profile).toBeDefined();
    expect(profile?.fullName).toBe('Nguyễn Văn Thợ');
    expect(profile?.averageRating).toBe(4.85);
    expect(profile?.ratingCount).toBe(42);
    expect(profile?.completedOrderCount).toBe(105);

    // Lần 2: Cache hit -> không gọi fetch thêm
    const profilesCached = await enricher.enrichWorkerProfiles(['worker-uuid-123']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(profilesCached.get('worker-uuid-123')?.fullName).toBe('Nguyễn Văn Thợ');
  });

  it('tính toán khoảng cách haversine hợp lý khi có toạ độ', () => {
    // Tọa độ gần nhau ~ 2.5km (Đà Nẵng: Cầu Rồng đến Cầu Sông Hàn)
    const dist = enricher.calculateDistance(16.0602, 108.2236, 16.0717, 108.2255);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(5);
  });
});
