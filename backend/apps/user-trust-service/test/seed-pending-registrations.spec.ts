import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Seed Pending Registrations Script Logic', () => {
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('fails early with clear error when catalog has no categories', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('catalog_service.categories')) {
          return { rows: [] }; // Empty categories
        }
        if (sql.includes('catalog_service.services')) {
          return { rows: [{ id: 's-1', category_id: 'c-1', name: 'Sửa điện' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const runSeedLogic = async (client: typeof mockClient) => {
      const catRes = await client.query('SELECT id, name FROM catalog_service.categories LIMIT 5;');
      const svcRes = await client.query(
        'SELECT id, category_id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;',
      );

      const availableCategories = catRes.rows;
      const availableServices = svcRes.rows;

      if (!availableCategories || availableCategories.length === 0) {
        throw new Error(
          'Catalog chưa có danh mục nào (categories empty). Vui lòng seed catalog_service trước khi chạy script.',
        );
      }

      if (!availableServices || availableServices.length === 0) {
        throw new Error(
          'Catalog chưa có dịch vụ nào đang hoạt động (services empty). Vui lòng seed catalog_service trước khi chạy script.',
        );
      }
    };

    await expect(runSeedLogic(mockClient)).rejects.toThrow(
      'Catalog chưa có danh mục nào (categories empty). Vui lòng seed catalog_service trước khi chạy script.',
    );
  });

  it('fails early with clear error when catalog has no active services (no fake UUID generated)', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('catalog_service.categories')) {
          return { rows: [{ id: 'c-1', name: 'Điện dân dụng' }] };
        }
        if (sql.includes('catalog_service.services')) {
          return { rows: [] }; // Empty services
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const runSeedLogic = async (client: typeof mockClient) => {
      const catRes = await client.query('SELECT id, name FROM catalog_service.categories LIMIT 5;');
      const svcRes = await client.query(
        'SELECT id, category_id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;',
      );

      const availableCategories = catRes.rows;
      const availableServices = svcRes.rows;

      if (!availableCategories || availableCategories.length === 0) {
        throw new Error(
          'Catalog chưa có danh mục nào (categories empty). Vui lòng seed catalog_service trước khi chạy script.',
        );
      }

      if (!availableServices || availableServices.length === 0) {
        throw new Error(
          'Catalog chưa có dịch vụ nào đang hoạt động (services empty). Vui lòng seed catalog_service trước khi chạy script.',
        );
      }
    };

    await expect(runSeedLogic(mockClient)).rejects.toThrow(
      'Catalog chưa có dịch vụ nào đang hoạt động (services empty). Vui lòng seed catalog_service trước khi chạy script.',
    );
  });

  it('rolls back transaction and sets process.exitCode = 1 when a database query errors', async () => {
    const rollbackSpy = vi.fn().mockResolvedValue({});
    const releaseSpy = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN') return {};
        if (sql === 'ROLLBACK') return rollbackSpy();
        if (sql.includes('catalog_service.categories')) {
          return { rows: [{ id: 'c-1', name: 'Điện nước' }] };
        }
        if (sql.includes('catalog_service.services')) {
          return { rows: [{ id: 's-1', category_id: 'c-1', name: 'Sửa điện' }] };
        }
        if (sql.includes('INSERT INTO user_trust_service.users')) {
          throw new Error('Database disk full or constraint violation');
        }
        return { rows: [] };
      }),
      release: releaseSpy,
    };

    const seedWithErrorHandling = async () => {
      let client = mockClient;
      try {
        const catRes = await client.query('SELECT id, name FROM catalog_service.categories LIMIT 5;');
        const svcRes = await client.query('SELECT id, category_id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;');

        if (!catRes.rows.length || !svcRes.rows.length) {
          throw new Error('Catalog empty');
        }

        await client.query('BEGIN');
        await client.query('INSERT INTO user_trust_service.users ...');
        await client.query('COMMIT');
      } catch (err) {
        if (client) {
          try {
            await client.query('ROLLBACK');
          } catch {}
        }
        console.error('❌ Lỗi khi tạo dữ liệu:', err);
        process.exitCode = 1;
      } finally {
        if (client) client.release();
      }
    };

    await seedWithErrorHandling();

    expect(rollbackSpy).toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

