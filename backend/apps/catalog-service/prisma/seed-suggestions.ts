import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import type { ServiceSuggestionGroup } from '../src/common/dto/suggestion-group.dto.js';

type PresetsModule = typeof import('./suggestion-presets.js');

export interface SeedSuggestionsOptions {
  dryRun: boolean;
  force: boolean;
  seedSampleCatalog: boolean;
}

export interface SeedSuggestionsSummary {
  dryRun: boolean;
  force: boolean;
  seedSampleCatalog: boolean;
  sampleCatalogSeeded: {
    categoriesInserted: number;
    servicesInserted: number;
  };
  categories: {
    total: number;
    updated: number;
    skippedExisting: number;
    details: Array<{
      id: string;
      name: string;
      presetCode: string;
      action: 'updated' | 'would_update' | 'skipped_existing';
    }>;
  };
  services: {
    total: number;
    updated: number;
    skippedExisting: number;
    inheritedFromCategory: number;
    details: Array<{
      id: string;
      name: string;
      presetCode: string | null;
      action:
        | 'updated'
        | 'would_update'
        | 'skipped_existing'
        | 'inherits_category';
    }>;
  };
}

export function parseSeedCliArgs(argv: string[]): SeedSuggestionsOptions {
  const args = new Set(argv);
  return {
    dryRun: args.has('--dry-run') || args.has('-n'),
    force: args.has('--force') || args.has('-f'),
    seedSampleCatalog: args.has('--seed-sample-catalog'),
  };
}

function resolveCatalogDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const direct = env.DIRECT_URL_CATALOG?.trim();
  const serviceUrl = env.DATABASE_URL_CATALOG?.trim();
  const sharedUrl = env.DATABASE_URL?.trim();
  const effective = direct || serviceUrl || sharedUrl;
  if (!effective && env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL_CATALOG or DATABASE_URL is required');
  }
  const raw =
    effective || 'postgresql://postgres:postgres@localhost:5432/handygo';
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Invalid PostgreSQL connection URL for catalog-service');
  }
  url.searchParams.set('schema', 'catalog_service');
  return url.toString();
}

function validatePresetGroups(
  groups: ServiceSuggestionGroup[],
  contextLabel: string,
): void {
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 6) {
    throw new Error(`${contextLabel}: suggestionGroups must have 1..6 groups`);
  }
  const keys = new Set<string>();
  for (const g of groups) {
    if (!g.key || !/^[a-z0-9_]+$/.test(g.key) || g.key.length > 40) {
      throw new Error(`${contextLabel}: invalid key '${g.key}'`);
    }
    if (keys.has(g.key)) {
      throw new Error(`${contextLabel}: duplicate key '${g.key}'`);
    }
    keys.add(g.key);
    if (!g.label || g.label.trim().length > 80) {
      throw new Error(`${contextLabel}: invalid label for key '${g.key}'`);
    }
    if (
      !Array.isArray(g.options) ||
      g.options.length < 1 ||
      g.options.length > 15
    ) {
      throw new Error(`${contextLabel}: invalid options count for '${g.key}'`);
    }
  }
}

export async function runSeedCatalogSuggestions(
  options: SeedSuggestionsOptions,
): Promise<SeedSuggestionsSummary> {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // .env is optional when environment variables are supplied directly
  }

  const presetsUrl = new URL('./suggestion-presets.ts', import.meta.url).href;
  const {
    CATEGORY_SUGGESTION_PRESETS,
    SERVICE_SUGGESTION_OVERRIDES,
    SAMPLE_CATALOG_SERVICES,
    matchCategoryPreset,
    matchServiceOverridePreset,
  } = (await import(presetsUrl)) as PresetsModule;

  for (const catPreset of CATEGORY_SUGGESTION_PRESETS) {
    validatePresetGroups(
      catPreset.suggestionGroups,
      `categoryPreset(${catPreset.code})`,
    );
  }
  for (const svcPreset of SERVICE_SUGGESTION_OVERRIDES) {
    validatePresetGroups(
      svcPreset.suggestionGroups,
      `servicePreset(${svcPreset.code})`,
    );
  }

  const connectionString = resolveCatalogDatabaseUrl(process.env);
  const client = new Client({ connectionString });
  await client.connect();

  const summary: SeedSuggestionsSummary = {
    dryRun: options.dryRun,
    force: options.force,
    seedSampleCatalog: options.seedSampleCatalog,
    sampleCatalogSeeded: {
      categoriesInserted: 0,
      servicesInserted: 0,
    },
    categories: {
      total: 0,
      updated: 0,
      skippedExisting: 0,
      details: [],
    },
    services: {
      total: 0,
      updated: 0,
      skippedExisting: 0,
      inheritedFromCategory: 0,
      details: [],
    },
  };

  try {
    await client.query('BEGIN');

    if (options.seedSampleCatalog) {
      const categoryIdByCode = new Map<string, string>();

      for (const preset of CATEGORY_SUGGESTION_PRESETS) {
        const existingCat = await client.query<{ id: string }>(
          `SELECT id FROM "catalog_service"."categories"
           WHERE id = $1 OR LOWER(name) = LOWER($2)
           LIMIT 1`,
          [preset.sampleId, preset.sampleName],
        );

        if (existingCat.rowCount && existingCat.rows[0]) {
          categoryIdByCode.set(preset.code, existingCat.rows[0].id);
        } else {
          categoryIdByCode.set(preset.code, preset.sampleId);
          summary.sampleCatalogSeeded.categoriesInserted += 1;
          await client.query(
            `INSERT INTO "catalog_service"."categories"
               ("id", "parent_id", "name", "description", "is_active", "created_at", "updated_at")
             VALUES ($1, NULL, $2, $3, true, NOW(), NOW())`,
            [preset.sampleId, preset.sampleName, preset.sampleDescription],
          );
        }
      }

      for (const svc of SAMPLE_CATALOG_SERVICES) {
        const categoryId = categoryIdByCode.get(svc.categoryCode);
        if (!categoryId) {
          continue;
        }
        const existingSvc = await client.query<{ id: string }>(
          `SELECT id FROM "catalog_service"."services"
           WHERE id = $1 OR (category_id = $2 AND LOWER(name) = LOWER($3))
           LIMIT 1`,
          [svc.id, categoryId, svc.name],
        );

        if (!existingSvc.rowCount) {
          summary.sampleCatalogSeeded.servicesInserted += 1;
          await client.query(
            `INSERT INTO "catalog_service"."services"
               ("id", "category_id", "name", "description", "is_active", "created_at", "updated_at")
             VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
            [svc.id, categoryId, svc.name, svc.description],
          );
        }
      }
    }

    // Load categories
    const categoriesRes = await client.query<{
      id: string;
      name: string;
      description: string | null;
      suggestion_groups: unknown;
    }>(
      `SELECT id, name, description, suggestion_groups
       FROM "catalog_service"."categories"
       ORDER BY name ASC`,
    );

    summary.categories.total = categoriesRes.rowCount ?? 0;

    for (const row of categoriesRes.rows) {
      const hasExisting =
        row.suggestion_groups !== null && row.suggestion_groups !== undefined;
      const matched = matchCategoryPreset({
        name: row.name,
        description: row.description,
      });

      if (hasExisting && !options.force) {
        summary.categories.skippedExisting += 1;
        summary.categories.details.push({
          id: row.id,
          name: row.name,
          presetCode: matched.code,
          action: 'skipped_existing',
        });
        continue;
      }

      validatePresetGroups(
        matched.suggestionGroups,
        `category(${row.name}:${matched.code})`,
      );

      if (!options.dryRun) {
        await client.query(
          `UPDATE "catalog_service"."categories"
           SET "suggestion_groups" = $1::jsonb,
               "updated_at" = NOW()
           WHERE "id" = $2`,
          [JSON.stringify(matched.suggestionGroups), row.id],
        );
      }

      summary.categories.updated += 1;
      summary.categories.details.push({
        id: row.id,
        name: row.name,
        presetCode: matched.code,
        action: options.dryRun ? 'would_update' : 'updated',
      });
    }

    // Load services
    const servicesRes = await client.query<{
      id: string;
      name: string;
      suggestion_groups: unknown;
    }>(
      `SELECT id, name, suggestion_groups
       FROM "catalog_service"."services"
       ORDER BY name ASC`,
    );

    summary.services.total = servicesRes.rowCount ?? 0;

    for (const row of servicesRes.rows) {
      const hasExisting =
        row.suggestion_groups !== null && row.suggestion_groups !== undefined;
      const matchedOverride = matchServiceOverridePreset({
        id: row.id,
        name: row.name,
      });

      if (hasExisting && !options.force) {
        summary.services.skippedExisting += 1;
        summary.services.details.push({
          id: row.id,
          name: row.name,
          presetCode: matchedOverride?.code ?? null,
          action: 'skipped_existing',
        });
        continue;
      }

      if (!matchedOverride) {
        summary.services.inheritedFromCategory += 1;
        summary.services.details.push({
          id: row.id,
          name: row.name,
          presetCode: null,
          action: 'inherits_category',
        });
        continue;
      }

      validatePresetGroups(
        matchedOverride.suggestionGroups,
        `service(${row.name}:${matchedOverride.code})`,
      );

      if (!options.dryRun) {
        await client.query(
          `UPDATE "catalog_service"."services"
           SET "suggestion_groups" = $1::jsonb,
               "updated_at" = NOW()
           WHERE "id" = $2`,
          [JSON.stringify(matchedOverride.suggestionGroups), row.id],
        );
      }

      summary.services.updated += 1;
      summary.services.details.push({
        id: row.id,
        name: row.name,
        presetCode: matchedOverride.code,
        action: options.dryRun ? 'would_update' : 'updated',
      });
    }

    if (options.dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    return summary;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const options = parseSeedCliArgs(process.argv.slice(2));
  runSeedCatalogSuggestions(options)
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            mode: result.dryRun ? 'DRY_RUN' : 'APPLIED',
            force: result.force,
            seedSampleCatalog: result.seedSampleCatalog,
            sampleCatalogSeeded: result.sampleCatalogSeeded,
            categories: {
              total: result.categories.total,
              updated: result.categories.updated,
              skippedExisting: result.categories.skippedExisting,
            },
            services: {
              total: result.services.total,
              updated: result.services.updated,
              skippedExisting: result.services.skippedExisting,
              inheritedFromCategory: result.services.inheritedFromCategory,
            },
          },
          null,
          2,
        ),
      );
    })
    .catch((err: unknown) => {
      console.error(
        '[seed:catalog:suggestions] Failed:',
        err instanceof Error ? err.message : String(err),
      );
      process.exitCode = 1;
    });
}
