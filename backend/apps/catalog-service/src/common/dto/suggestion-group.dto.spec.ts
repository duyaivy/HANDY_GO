import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  normalizeSuggestionGroups,
  SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
  toPrismaSuggestionGroups,
  validateSuggestionGroupsValue,
} from './suggestion-group.dto.js';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto.js';
import { UpdateCategoryDto } from '../../categories/dto/update-category.dto.js';
import { CreateServiceDto } from '../../services/dto/create-service.dto.js';
import { UpdateServiceDto } from '../../services/dto/update-service.dto.js';
import {
  CATEGORY_SUGGESTION_PRESETS,
  SERVICE_SUGGESTION_OVERRIDES,
  matchCategoryPreset,
  matchServiceOverridePreset,
  SAMPLE_CATALOG_SERVICES,
} from '../../../prisma/suggestion-presets.js';

describe('suggestion-group.dto & @IsValidSuggestionGroups()', () => {
  it('accepts undefined and null (to omit or clear override)', async () => {
    expect(validateSuggestionGroupsValue(undefined)).toBeNull();
    expect(validateSuggestionGroupsValue(null)).toBeNull();

    const dtoUndefined = plainToInstance(CreateCategoryDto, {
      name: 'Điện lạnh',
    });
    const dtoNull = plainToInstance(UpdateServiceDto, {
      suggestionGroups: null,
    });

    expect(await validate(dtoUndefined)).toHaveLength(0);
    expect(await validate(dtoNull)).toHaveLength(0);
  });

  it('accepts valid suggestionGroups and trims whitespace on transform', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      categoryId: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      suggestionGroups: [
        {
          key: '  issue_type  ',
          label: '  Tình trạng thiết bị  ',
          descriptionPrefix: '  Tình trạng  ',
          selectionMode: 'single',
          options: ['  Không lạnh  ', '  Chảy nước  ', 'Chưa rõ'],
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.suggestionGroups).toEqual([
      {
        key: 'issue_type',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: ['Không lạnh', 'Chảy nước', 'Chưa rõ'],
      },
    ]);
  });

  it('rejects empty array [] and >6 groups with top-level suggestionGroups constraint error', async () => {
    const emptyDto = plainToInstance(CreateCategoryDto, {
      name: 'Điện lạnh',
      suggestionGroups: [],
    });
    const emptyErrors = await validate(emptyDto);
    expect(emptyErrors).toHaveLength(1);
    expect(emptyErrors[0]?.property).toBe('suggestionGroups');
    expect(Object.values(emptyErrors[0]?.constraints ?? {})[0]).toContain(
      'between 1 and 6 groups',
    );

    const sevenGroups = Array.from({ length: 7 }, (_, idx) => ({
      key: `group_${idx}`,
      label: `Nhóm ${idx}`,
      options: ['Lựa chọn 1'],
    }));
    const tooManyDto = plainToInstance(UpdateCategoryDto, {
      suggestionGroups: sevenGroups,
    });
    const tooManyErrors = await validate(tooManyDto);
    expect(tooManyErrors).toHaveLength(1);
    expect(tooManyErrors[0]?.property).toBe('suggestionGroups');
    expect(Object.values(tooManyErrors[0]?.constraints ?? {})[0]).toContain(
      'between 1 and 6 groups',
    );
  });

  it('rejects invalid key format and duplicate keys across groups', async () => {
    const badKeyDto = plainToInstance(CreateCategoryDto, {
      name: 'Điện lạnh',
      suggestionGroups: [
        {
          key: 'Invalid-Key!',
          label: 'Tình trạng',
          options: ['Không lạnh'],
        },
      ],
    });
    const badKeyErrors = await validate(badKeyDto);
    expect(badKeyErrors).toHaveLength(1);
    expect(badKeyErrors[0]?.property).toBe('suggestionGroups');
    expect(Object.values(badKeyErrors[0]?.constraints ?? {})[0]).toContain(
      'must match /^[a-z0-9_]+$/',
    );

    const dupKeyDto = plainToInstance(CreateCategoryDto, {
      name: 'Điện lạnh',
      suggestionGroups: [
        {
          key: 'issue',
          label: 'Nhóm 1',
          options: ['A'],
        },
        {
          key: 'issue',
          label: 'Nhóm 2',
          options: ['B'],
        },
      ],
    });
    const dupKeyErrors = await validate(dupKeyDto);
    expect(dupKeyErrors).toHaveLength(1);
    expect(dupKeyErrors[0]?.property).toBe('suggestionGroups');
    expect(Object.values(dupKeyErrors[0]?.constraints ?? {})[0]).toContain(
      "key 'issue' is duplicated",
    );
  });

  it('rejects invalid selectionMode, empty options, >15 options, and case-insensitive duplicate options', async () => {
    expect(
      validateSuggestionGroupsValue([
        {
          key: 'issue',
          label: 'Tình trạng',
          selectionMode: 'all',
          options: ['Không lạnh'],
        },
      ]),
    ).toContain("selectionMode must be either 'single' or 'multiple'");

    expect(
      validateSuggestionGroupsValue([
        {
          key: 'issue',
          label: 'Tình trạng',
          options: [],
        },
      ]),
    ).toContain('options must contain between 1 and 15 items');

    expect(
      validateSuggestionGroupsValue([
        {
          key: 'issue',
          label: 'Tình trạng',
          options: Array.from({ length: 16 }, (_, i) => `Opt ${i}`),
        },
      ]),
    ).toContain('options must contain between 1 and 15 items');

    expect(
      validateSuggestionGroupsValue([
        {
          key: 'issue',
          label: 'Tình trạng',
          options: ['Chảy nước', '  chảy nước  '],
        },
      ]),
    ).toContain('is duplicated within suggestionGroups[0].options');
  });

  it('converts values via toPrismaSuggestionGroups accurately', () => {
    expect(toPrismaSuggestionGroups(undefined)).toBeUndefined();
    expect(toPrismaSuggestionGroups(null)).toBe(Prisma.DbNull);

    const normalized = toPrismaSuggestionGroups(
      SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
    );
    expect(normalized).toEqual(
      normalizeSuggestionGroups(SUGGESTION_GROUPS_SWAGGER_EXAMPLE),
    );
  });

  it('validates all 12 category presets, 16 service overrides, and matches all 38+ sample services', () => {
    expect(CATEGORY_SUGGESTION_PRESETS).toHaveLength(12);
    for (const cat of CATEGORY_SUGGESTION_PRESETS) {
      expect(validateSuggestionGroupsValue(cat.suggestionGroups)).toBeNull();
    }

    expect(SERVICE_SUGGESTION_OVERRIDES).toHaveLength(16);
    for (const svc of SERVICE_SUGGESTION_OVERRIDES) {
      expect(validateSuggestionGroupsValue(svc.suggestionGroups)).toBeNull();
    }

    expect(SAMPLE_CATALOG_SERVICES.length).toBeGreaterThanOrEqual(38);
    for (const sample of SAMPLE_CATALOG_SERVICES) {
      const catPreset = CATEGORY_SUGGESTION_PRESETS.find(
        (c) => c.code === sample.categoryCode,
      );
      expect(catPreset).toBeDefined();
      const matchedCat = matchCategoryPreset({
        name: catPreset!.sampleName,
        description: catPreset!.sampleDescription,
      });
      expect(matchedCat.code).toBe(sample.categoryCode);

      const override = matchServiceOverridePreset({
        id: sample.id,
        name: sample.name,
      });
      if (override) {
        expect(
          validateSuggestionGroupsValue(override.suggestionGroups),
        ).toBeNull();
      }
    }
  });
});
