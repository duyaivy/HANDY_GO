import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

type SearchQuery = {
  search: string;
  isActive?: boolean;
  parentId?: string;
  categoryId?: string;
  page: number;
  limit: number;
};

// Table names and ordering are source-controlled SQL fragments, never input.
const sources = {
  categories: {
    table: Prisma.sql`catalog_service.categories`,
    columns: Prisma.sql`id, name, parent_id`,
    order: Prisma.sql`parent_id ASC, name ASC`,
    pageOrder: Prisma.sql`page.parent_id ASC, page.name ASC`,
  },
  services: {
    table: Prisma.sql`catalog_service.services`,
    columns: Prisma.sql`id, name`,
    order: Prisma.sql`name ASC`,
    pageOrder: Prisma.sql`page.name ASC`,
  },
};

/** Match/count/page in PostgreSQL; Prisma hydrates only the returned page IDs. */
export async function searchCatalogPage(
  prisma: Pick<PrismaService, '$queryRaw'>,
  kind: keyof typeof sources,
  query: SearchQuery,
): Promise<{ ids: string[]; total: number }> {
  const source = sources[kind];
  // Preserve Prisma contains' existing LIKE wildcards and backslash escapes.
  const pattern = `%${query.search}%`;
  const predicates = [
    Prisma.sql`(
    catalog_service.unaccent('catalog_service.unaccent'::regdictionary, normalize(name, NFC))
      ILIKE catalog_service.unaccent('catalog_service.unaccent'::regdictionary, normalize(${pattern}::text, NFC))
    OR catalog_service.unaccent('catalog_service.unaccent'::regdictionary, normalize(description, NFC))
      ILIKE catalog_service.unaccent('catalog_service.unaccent'::regdictionary, normalize(${pattern}::text, NFC))
  )`,
  ];
  if (query.isActive !== undefined)
    predicates.push(Prisma.sql`is_active = ${query.isActive}`);
  if (kind === 'categories' && query.parentId !== undefined) {
    predicates.push(Prisma.sql`parent_id = ${query.parentId}::uuid`);
  }
  if (kind === 'services' && query.categoryId) {
    predicates.push(Prisma.sql`category_id = ${query.categoryId}::uuid`);
  }

  // One statement means count and page share both predicates and MVCC snapshot.
  // The LEFT JOIN retains the count even when OFFSET goes past the last row.
  const rows = await prisma.$queryRaw<
    { id: string | null; total: bigint }[]
  >(Prisma.sql`
    WITH matches AS (
      SELECT ${source.columns} FROM ${source.table}
      WHERE ${Prisma.join(predicates, ' AND ')}
    ), page AS (
      SELECT * FROM matches ORDER BY ${source.order}
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    )
    SELECT page.id, totals.total
    FROM (SELECT COUNT(*) AS total FROM matches) totals
    LEFT JOIN page ON TRUE
    ORDER BY ${source.pageOrder}
  `);
  return {
    ids: rows.flatMap((row) => (row.id === null ? [] : [row.id])),
    total: Number(rows[0].total),
  };
}
