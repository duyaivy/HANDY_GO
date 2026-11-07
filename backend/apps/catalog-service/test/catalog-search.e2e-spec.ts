import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CategoriesController } from '../src/categories/categories.controller.js';
import { ServicesController } from '../src/services/services.controller.js';
import { CategoriesService } from '../src/categories/categories.service.js';
import { ServicesService } from '../src/services/services.service.js';
import * as catalogSearch from '../src/common/catalog-search.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { RedisService } from '@app/redis';
import type { OutboxPublisherService } from '@app/common';

// Explicit opt-in only. Never fall back to application/production database URLs.
const databaseUrl = process.env.CATALOG_SEARCH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'Set CATALOG_SEARCH_TEST_DATABASE_URL to an empty disposable PostgreSQL database',
  );
const url = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/catalog_search_test'
) {
  throw new Error(
    'Catalog search tests require local disposable database catalog_search_test',
  );
}

describe('Catalog search (real PostgreSQL)', () => {
  const sql = new Client({ connectionString: databaseUrl });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const cache = new Map<string, unknown>();
  const redis = {
    get: vi.fn(async (key: string) => cache.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      cache.set(key, value);
    }),
  };
  const outbox = {} as OutboxPublisherService;
  const categories = new CategoriesService(
    prisma as PrismaService,
    outbox,
    redis as unknown as RedisService,
  );
  const services = new ServicesService(
    prisma as PrismaService,
    outbox,
    redis as unknown as RedisService,
  );
  const categoryId = randomUUID();
  let ownsSchema = false;
  let app: INestApplication;

  beforeAll(async () => {
    await sql.connect();
    // CREATE TABLE fails safely if this is not an empty fixture database.
    await sql.query(
      readFileSync(
        'apps/catalog-service/prisma/migrations/20261001000000_init_catalog/migration.sql',
        'utf8',
      ),
    );
    ownsSchema = true;
    const extensionMigration =
      'apps/catalog-service/prisma/migrations/20261106000000_catalog_unaccent/migration.sql';
    if (existsSync(extensionMigration))
      await sql.query(readFileSync(extensionMigration, 'utf8'));
    await prisma.category.create({
      data: { id: categoryId, name: 'Cắt tỉa cảnh' },
    });
    await prisma.service.create({ data: { name: 'Cắt tỉa cảnh', categoryId } });
    for (const fixture of [
      { name: 'Dọn dẹp', description: null, isActive: false },
      { name: 'ĐÓN ĐẸP', description: null, isActive: true },
      {
        name: 'Unicode',
        description: 'Chăm sóc vườn'.normalize('NFD'),
        isActive: true,
      },
      { name: "O'Brien 100%_", description: null, isActive: true },
      { name: 'X unrelated', description: null, isActive: true },
      { name: 'A description', description: 'Cắt tỉa', isActive: false },
      {
        name: 'Cắt Unicode'.normalize('NFD'),
        description: null,
        isActive: true,
      },
    ]) {
      await prisma.category.create({
        data: { ...fixture, parentId: categoryId },
      });
      await prisma.service.create({ data: { ...fixture, categoryId } });
    }
    const module = await Test.createTestingModule({
      controllers: [CategoriesController, ServicesController],
      providers: [
        { provide: CategoriesService, useValue: categories },
        { provide: ServicesService, useValue: services },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    cache.clear();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    if (ownsSchema) await sql.query('DROP SCHEMA catalog_service CASCADE');
    await sql.end();
  });

  it('migration is additive and repeatable with the expected extension schema', async () => {
    const migration = readFileSync(
      'apps/catalog-service/prisma/migrations/20261106000000_catalog_unaccent/migration.sql',
      'utf8',
    );
    await sql.query(migration);
    const result = await sql.query(
      "SELECT catalog_service.unaccent('catalog_service.unaccent'::regdictionary, 'Đặng') AS folded",
    );
    expect(result.rows).toEqual([{ folded: 'Dang' }]);
  });

  it('migration rejects an extension in another schema without relocating it', async () => {
    await sql.query('BEGIN');
    try {
      await sql.query('ALTER EXTENSION unaccent SET SCHEMA public');
      const migration = readFileSync(
        'apps/catalog-service/prisma/migrations/20261106000000_catalog_unaccent/migration.sql',
        'utf8',
      );
      await expect(sql.query(migration)).rejects.toThrow(
        'Catalog search requires unaccent in schema catalog_service',
      );
    } finally {
      await sql.query('ROLLBACK');
    }
  });

  for (const [kind, service] of [
    ['categories', categories],
    ['services', services],
  ] as const) {
    it(`${kind}: selection and hydration keep one snapshot during admin updates`, async () => {
      const original =
        kind === 'categories'
          ? await prisma.category.findFirstOrThrow({
              where: { name: 'Dọn dẹp' },
            })
          : await prisma.service.findFirstOrThrow({
              where: { name: 'Dọn dẹp' },
            });
      const otherCategory = await prisma.category.findFirstOrThrow({
        where: { name: 'Unicode' },
      });
      const assignmentColumn =
        kind === 'categories' ? 'parent_id' : 'category_id';
      const searchPage = catalogSearch.searchCatalogPage;
      // Keep the real SQL, but deterministically interleave a second connection's
      // committed admin update after selection and before Prisma hydration.
      const interleave = vi
        .spyOn(catalogSearch, 'searchCatalogPage')
        .mockImplementationOnce(async (...args) => {
          const page = await searchPage(...args);
          await sql.query(
            `UPDATE catalog_service.${kind} SET name = $1, is_active = true, ${assignmentColumn} = $2::uuid WHERE id = $3::uuid`,
            ['Unrelated', otherCategory.id, original.id],
          );
          return page;
        });
      try {
        const filter =
          kind === 'categories' ? { parentId: categoryId } : { categoryId };
        const query = { search: 'don dep', isActive: false, ...filter };
        const result = (await service.findAll(query)) as any;
        expect(result.meta.total).toBe(1);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({
          id: original.id,
          name: 'Dọn dẹp',
          isActive: false,
          ...filter,
        });
        expect(await service.findAll(query)).toEqual(result);
      } finally {
        interleave.mockRestore();
        await sql.query(
          `UPDATE catalog_service.${kind} SET name = $1, is_active = false, ${assignmentColumn} = $2::uuid WHERE id = $3::uuid`,
          ['Dọn dẹp', categoryId, original.id],
        );
      }
    });
    it(`${kind}: bypasses stale pre-accent empty cache entries`, async () => {
      const key =
        kind === 'categories'
          ? 'catalog:categories:list:ia:all,s:cat tia,pid:all,p:1,l:20'
          : 'catalog:services:list:cid:all,ia:all,s:cat tia,p:1,l:20';
      cache.set(key, {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      expect(
        ((await service.findAll({ search: 'cat tia' })) as any).meta.total,
      ).toBe(2);
    });
    it(`${kind}: cat tia finds Cắt tỉa cảnh`, async () => {
      const result = (await service.findAll({ search: 'cat tia' })) as any;
      expect(result.data.map((item: any) => item.name).sort()).toEqual([
        'A description',
        'Cắt tỉa cảnh',
      ]);
      expect(result.meta.total).toBe(2);
    });
    it(`${kind}: existing accented partial search still matches`, async () => {
      const result = (await service.findAll({ search: 'cắt tỉa' })) as any;
      expect(result.data.map((item: any) => item.name).sort()).toEqual([
        'A description',
        'Cắt tỉa cảnh',
      ]);
    });
    it.each(['CAT TIA', 'cắt tỉa', 'cắt tỉa'.normalize('NFD')])(
      `${kind}: case/accent/Unicode query %s`,
      async (search) => {
        const result = (await service.findAll({ search })) as any;
        expect(result.data.map((item: any) => item.name).sort()).toEqual([
          'A description',
          'Cắt tỉa cảnh',
        ]);
        expect(result.meta.total).toBe(2);
      },
    );
    it.each(['don dep', 'DON DEP'])(
      `${kind}: folds đ/Đ for %s`,
      async (search) => {
        const result = (await service.findAll({ search })) as any;
        expect(result.data.map((item: any) => item.name).sort()).toEqual([
          'Dọn dẹp',
          'ĐÓN ĐẸP',
        ]);
      },
    );
    it(`${kind}: matches decomposed description`, async () => {
      const result = (await service.findAll({
        search: 'cham soc vuon',
      })) as any;
      expect(result.data.map((item: any) => item.name)).toEqual(['Unicode']);
    });
    it(`${kind}: matches decomposed stored names`, async () => {
      const result = (await service.findAll({ search: 'cat unicode' })) as any;
      expect(result.data.map((item: any) => item.name)).toEqual([
        'Cắt Unicode'.normalize('NFD'),
      ]);
    });
    it(`${kind}: AND filters, false status and page/count/order survive warm cache`, async () => {
      const filter =
        kind === 'categories' ? { parentId: categoryId } : { categoryId };
      const query = {
        search: 'cat tia',
        isActive: false,
        ...filter,
        page: 1,
        limit: 1,
      };
      const cold = (await service.findAll(query)) as any;
      expect(cold.data.map((item: any) => item.name)).toEqual([
        'A description',
      ]);
      expect(cold.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
      expect(await service.findAll(query)).toEqual(cold);
      expect(redis.set).toHaveBeenLastCalledWith(expect.any(String), cold, 300);
      const emptyPage = (await service.findAll({ ...query, page: 2 })) as any;
      expect(emptyPage.data).toEqual([]);
      expect(emptyPage.meta.total).toBe(1);
      expect(
        ((await service.findAll({ ...query, isActive: true })) as any).data,
      ).toHaveLength(kind === 'services' ? 1 : 0);
      const other = randomUUID();
      expect(
        (
          (await service.findAll({
            ...query,
            ...(kind === 'categories'
              ? { parentId: other }
              : { categoryId: other }),
          })) as any
        ).meta.total,
      ).toBe(0);
    });
    it(`${kind}: pages the ordered matching set before hydration`, async () => {
      const first = (await service.findAll({
        search: 'cat tia',
        limit: 1,
      })) as any;
      const second = (await service.findAll({
        search: 'cat tia',
        limit: 1,
        page: 2,
      })) as any;
      // Categories retain parent_id ASC NULLS LAST; services retain name ASC.
      expect(first.data[0].name).toBe('A description');
      expect(second.data[0].name).toBe('Cắt tỉa cảnh');
      expect(second.meta).toEqual({
        total: 2,
        page: 2,
        limit: 1,
        totalPages: 2,
      });
      expect(second.data[0]).toHaveProperty(
        kind === 'categories' ? '_count' : 'category',
      );
    });
    it.each(["O'Brien", "%' OR true --", '100%', '100_', String.raw`100\%\_`])(
      `${kind}: binds pattern safely: %s`,
      async (search) => {
        const result = (await service.findAll({ search })) as any;
        expect(result.data.map((item: any) => item.name)).toEqual(
          search === "%' OR true --" ? [] : ["O'Brien 100%_"],
        );
      },
    );
    it(`${kind}: absent/empty search preserves the ORM list`, async () => {
      const all = (await service.findAll({})) as any;
      expect(all.meta.total).toBe(8);
      expect(await service.findAll({ search: '' })).toEqual(all);
    });
    it(`${kind}: HTTP preserves envelope and transformed scalar filters`, async () => {
      const filter =
        kind === 'categories' ? { parentId: categoryId } : { categoryId };
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${kind}`)
        .query({
          search: 'CAT TIA',
          isActive: 'false',
          ...filter,
          page: '1',
          limit: '1',
        })
        .expect(200);
      expect(response.body.statusCode).toBe(200);
      expect(response.body.message).toEqual(expect.any(String));
      expect(response.body.data.data.map((item: any) => item.name)).toEqual([
        'A description',
      ]);
      expect(response.body.data.meta).toEqual({
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
      });
      const none = await request(app.getHttpServer())
        .get(`/api/v1/${kind}`)
        .query({ search: 'not present' })
        .expect(200);
      expect(none.body.data.data).toEqual([]);
      expect(none.body.data.meta.total).toBe(0);
    });
    it.each([{ page: '0' }, { limit: '101' }, { isActive: 'no' }])(
      `${kind}: HTTP rejects invalid query %j`,
      async (query) => {
        await request(app.getHttpServer())
          .get(`/api/v1/${kind}`)
          .query(query)
          .expect(400);
      },
    );
    it(`${kind}: HTTP rejects invalid legacy UUID filter`, async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/${kind}`)
        .query(
          kind === 'categories'
            ? { parentId: 'invalid' }
            : { categoryId: 'invalid' },
        )
        .expect(400);
    });
  }
});
