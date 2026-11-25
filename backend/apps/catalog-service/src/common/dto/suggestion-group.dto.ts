import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export type SuggestionSelectionMode = 'single' | 'multiple';

export interface ServiceSuggestionGroup {
  key: string;
  label: string;
  descriptionPrefix?: string;
  selectionMode?: SuggestionSelectionMode;
  options: string[];
}

export const SUGGESTION_GROUP_KEY_REGEX = /^[a-z0-9_]+$/;
export const MAX_SUGGESTION_GROUPS = 6;
export const MAX_SUGGESTION_KEY_LENGTH = 40;
export const MAX_SUGGESTION_LABEL_LENGTH = 80;
export const MAX_SUGGESTION_PREFIX_LENGTH = 60;
export const MAX_SUGGESTION_OPTIONS = 15;
export const MAX_SUGGESTION_OPTION_LENGTH = 80;

export const SUGGESTION_GROUPS_SWAGGER_EXAMPLE: ServiceSuggestionGroup[] = [
  {
    key: 'issue',
    label: 'Tình trạng thiết bị',
    descriptionPrefix: 'Tình trạng',
    selectionMode: 'single',
    options: [
      'Không lạnh / yếu lạnh',
      'Chảy nước',
      'Kêu to / rung',
      'Không lên nguồn',
      'Báo lỗi',
      'Chưa rõ',
    ],
  },
  {
    key: 'device_type',
    label: 'Loại máy',
    descriptionPrefix: 'Loại máy',
    selectionMode: 'single',
    options: ['Treo tường', 'Âm trần', 'Tủ đứng', 'Chưa rõ'],
  },
  {
    key: 'severity',
    label: 'Mức độ',
    descriptionPrefix: 'Mức độ',
    selectionMode: 'single',
    options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp', 'Chưa rõ'],
  },
];

export class ServiceSuggestionGroupDto implements ServiceSuggestionGroup {
  @ApiProperty({
    description:
      'Unique group identifier within suggestionGroups (lowercase alphanumeric and underscore, 1..40 chars)',
    example: 'issue',
    pattern: '^[a-z0-9_]+$',
    minLength: 1,
    maxLength: MAX_SUGGESTION_KEY_LENGTH,
  })
  key!: string;

  @ApiProperty({
    description: 'Display title for the suggestion group shown on Mobile/Admin',
    example: 'Tình trạng thiết bị',
    minLength: 1,
    maxLength: MAX_SUGGESTION_LABEL_LENGTH,
  })
  label!: string;

  @ApiPropertyOptional({
    description:
      'Short prefix used when composing the booking description text (defaults to label when omitted)',
    example: 'Tình trạng',
    minLength: 1,
    maxLength: MAX_SUGGESTION_PREFIX_LENGTH,
  })
  descriptionPrefix?: string;

  @ApiPropertyOptional({
    description: 'Chip selection mode for this group on Mobile (default: single)',
    enum: ['single', 'multiple'],
    default: 'single',
    example: 'single',
  })
  selectionMode?: SuggestionSelectionMode;

  @ApiProperty({
    description:
      'List of selectable suggestion chips (1..15 non-empty unique strings, up to 80 chars each)',
    type: [String],
    example: [
      'Không lạnh / yếu lạnh',
      'Chảy nước',
      'Kêu to / rung',
      'Không lên nguồn',
      'Chưa rõ',
    ],
  })
  options!: string[];
}

/**
 * Validates suggestionGroups payload and returns a descriptive error string if invalid,
 * or null if valid. Allows `undefined` (omitted) and `null` (clear configuration).
 */
export function validateSuggestionGroupsValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return 'suggestionGroups must be an array of suggestion groups or null';
  }

  if (value.length < 1 || value.length > MAX_SUGGESTION_GROUPS) {
    return `suggestionGroups must contain between 1 and ${MAX_SUGGESTION_GROUPS} groups (pass null to clear)`;
  }

  const seenKeys = new Set<string>();

  for (let i = 0; i < value.length; i += 1) {
    const rawGroup = value[i];
    const groupIndexLabel = `suggestionGroups[${i}]`;

    if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
      return `${groupIndexLabel} must be an object`;
    }

    const group = rawGroup as Record<string, unknown>;

    // Validate key
    if (typeof group.key !== 'string') {
      return `${groupIndexLabel}.key must be a string`;
    }
    const key = group.key.trim();
    if (!key) {
      return `${groupIndexLabel}.key must not be empty`;
    }
    if (key.length > MAX_SUGGESTION_KEY_LENGTH) {
      return `${groupIndexLabel}.key cannot exceed ${MAX_SUGGESTION_KEY_LENGTH} characters`;
    }
    if (!SUGGESTION_GROUP_KEY_REGEX.test(key)) {
      return `${groupIndexLabel}.key must match /^[a-z0-9_]+$/`;
    }
    if (seenKeys.has(key)) {
      return `${groupIndexLabel}.key '${key}' is duplicated; group keys must be unique`;
    }
    seenKeys.add(key);

    // Validate label
    if (typeof group.label !== 'string') {
      return `${groupIndexLabel}.label must be a string`;
    }
    const label = group.label.trim();
    if (!label) {
      return `${groupIndexLabel}.label must not be empty`;
    }
    if (label.length > MAX_SUGGESTION_LABEL_LENGTH) {
      return `${groupIndexLabel}.label cannot exceed ${MAX_SUGGESTION_LABEL_LENGTH} characters`;
    }

    // Validate descriptionPrefix (optional)
    if (
      group.descriptionPrefix !== undefined &&
      group.descriptionPrefix !== null
    ) {
      if (typeof group.descriptionPrefix !== 'string') {
        return `${groupIndexLabel}.descriptionPrefix must be a string`;
      }
      const prefix = group.descriptionPrefix.trim();
      if (!prefix) {
        return `${groupIndexLabel}.descriptionPrefix must not be empty when provided`;
      }
      if (prefix.length > MAX_SUGGESTION_PREFIX_LENGTH) {
        return `${groupIndexLabel}.descriptionPrefix cannot exceed ${MAX_SUGGESTION_PREFIX_LENGTH} characters`;
      }
    }

    // Validate selectionMode (optional)
    if (group.selectionMode !== undefined && group.selectionMode !== null) {
      if (
        group.selectionMode !== 'single' &&
        group.selectionMode !== 'multiple'
      ) {
        return `${groupIndexLabel}.selectionMode must be either 'single' or 'multiple'`;
      }
    }

    // Validate options
    if (!Array.isArray(group.options)) {
      return `${groupIndexLabel}.options must be an array of strings`;
    }
    if (
      group.options.length < 1 ||
      group.options.length > MAX_SUGGESTION_OPTIONS
    ) {
      return `${groupIndexLabel}.options must contain between 1 and ${MAX_SUGGESTION_OPTIONS} items`;
    }

    const seenOptions = new Set<string>();
    for (let j = 0; j < group.options.length; j += 1) {
      const rawOption = group.options[j];
      const optionLabel = `${groupIndexLabel}.options[${j}]`;
      if (typeof rawOption !== 'string') {
        return `${optionLabel} must be a string`;
      }
      const trimmedOption = rawOption.trim();
      if (!trimmedOption) {
        return `${optionLabel} must not be empty`;
      }
      if (trimmedOption.length > MAX_SUGGESTION_OPTION_LENGTH) {
        return `${optionLabel} cannot exceed ${MAX_SUGGESTION_OPTION_LENGTH} characters`;
      }
      const normalizedOptionKey = trimmedOption.toLocaleLowerCase('vi-VN');
      if (seenOptions.has(normalizedOptionKey)) {
        return `${optionLabel} '${trimmedOption}' is duplicated within ${groupIndexLabel}.options`;
      }
      seenOptions.add(normalizedOptionKey);
    }
  }

  return null;
}

/**
 * Top-level class-validator decorator for `suggestionGroups`.
 * Attaches descriptive constraint messages directly on the top-level `suggestionGroups`
 * property so `bootstrapApplication` reports them in `fieldErrors.suggestionGroups`.
 */
export function IsValidSuggestionGroups(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidSuggestionGroups',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return validateSuggestionGroupsValue(value) === null;
        },
        defaultMessage(args: ValidationArguments) {
          return (
            validateSuggestionGroupsValue(args.value) ??
            `${args.property} is invalid`
          );
        },
      },
    });
  };
}

/**
 * Normalizes a validated suggestionGroups array (trims strings, normalizes selectionMode).
 */
export function normalizeSuggestionGroups(
  groups: ServiceSuggestionGroup[],
): ServiceSuggestionGroup[] {
  return groups.map((group) => {
    const trimmedPrefix =
      typeof group.descriptionPrefix === 'string'
        ? group.descriptionPrefix.trim()
        : undefined;
    const normalized: ServiceSuggestionGroup = {
      key: group.key.trim(),
      label: group.label.trim(),
      ...(trimmedPrefix ? { descriptionPrefix: trimmedPrefix } : {}),
      selectionMode: group.selectionMode === 'multiple' ? 'multiple' : 'single',
      options: group.options.map((opt) => opt.trim()),
    };
    return normalized;
  });
}

/**
 * Converts DTO `suggestionGroups` into Prisma JSON input:
 * - `undefined` -> `undefined` (do not touch column)
 * - `null` -> `Prisma.DbNull` (set SQL NULL)
 * - `ServiceSuggestionGroup[]` -> normalized JSON array
 */
export function toPrismaSuggestionGroups(
  value: ServiceSuggestionGroup[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.DbNull;
  }
  const error = validateSuggestionGroupsValue(value);
  if (error) {
    throw new Error(error);
  }
  return normalizeSuggestionGroups(value) as unknown as Prisma.InputJsonValue;
}
