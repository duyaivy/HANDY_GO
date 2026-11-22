import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  EstimatePriceDto,
  EstimatePriceResponseDto,
} from '../dto/estimate-price.dto.js';

interface CatalogServiceRow {
  id: string;
  name: string;
  base_price_min: number | string | null;
  base_price_max: number | string | null;
}

interface AiPricingApiResponse {
  status: string;
  ai_ref_price_min: number;
  ai_ref_price_max: number;
  matched_case?: string | null;
  confidence: number;
  is_fallback: boolean;
}

const SYSTEM_FALLBACK_MIN = 150000;
const SYSTEM_FALLBACK_MAX = 350000;
// Leave room for persistence and the response within the caller's 15s deadline.
const MAX_AI_PRICING_TIMEOUT_MS = 5000;

function resolveValidPriceRange(
  min: unknown,
  max: unknown,
  defaultMin = SYSTEM_FALLBACK_MIN,
  defaultMax = SYSTEM_FALLBACK_MAX,
): { min: number; max: number } {
  const numMin =
    typeof min === 'number' && Number.isFinite(min) && min > 0 ? min : undefined;
  const numMax =
    typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : undefined;
  if (numMin !== undefined && numMax !== undefined && numMin < numMax) {
    return { min: Math.round(numMin), max: Math.round(numMax) };
  }
  return { min: defaultMin, max: defaultMax };
}

function isValidAiPricingPayload(data: any): data is AiPricingApiResponse {
  if (!data || typeof data !== 'object') return false;
  const min = data.ai_ref_price_min;
  const max = data.ai_ref_price_max;
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return false;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return false;
  if (min >= max) return false;
  return true;
}

@Injectable()
export class PricingEstimatorService {
  private readonly logger = new Logger(PricingEstimatorService.name);
  private readonly aiServiceUrl: string;
  private readonly timeoutMs: number;
  private readonly internalServiceSecret: string;

  constructor(private readonly prisma: PrismaService) {
    this.aiServiceUrl =
      process.env.AI_SERVICE_URL?.replace(/\/+$/, '') ||
      'http://localhost:8000';

    const rawTimeout =
      process.env.AI_PRICING_TIMEOUT_MS || process.env.AI_SERVICE_TIMEOUT_MS;
    const parsedTimeout = rawTimeout ? parseInt(rawTimeout, 10) : MAX_AI_PRICING_TIMEOUT_MS;
    this.timeoutMs =
      !isNaN(parsedTimeout) && parsedTimeout > 0
        ? Math.min(parsedTimeout, MAX_AI_PRICING_TIMEOUT_MS)
        : MAX_AI_PRICING_TIMEOUT_MS;

    this.internalServiceSecret =
      process.env.INTERNAL_SERVICE_SECRET ||
      'handy-go-internal-service-secret-key-12345';
  }

  async estimatePrice(dto: EstimatePriceDto): Promise<EstimatePriceResponseDto> {
    // 1. Fetch catalog service to get baseline prices and canonical service name
    const rows = await this.prisma.$queryRaw<CatalogServiceRow[]>`
      SELECT id, name, base_price_min, base_price_max
      FROM "catalog_service"."services"
      WHERE id = ${dto.serviceId}::uuid
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      throw new NotFoundException(
        `Service with ID '${dto.serviceId}' not found`,
      );
    }

    const service = rows[0];
    const catalogMin =
      service.base_price_min != null ? Number(service.base_price_min) : undefined;
    const catalogMax =
      service.base_price_max != null ? Number(service.base_price_max) : undefined;
    const validatedCatalogRange = resolveValidPriceRange(catalogMin, catalogMax);

    // 2. Call AI Service inference endpoint with bounded timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(
        new Error(`AI Service request timed out after ${this.timeoutMs}ms`),
      );
    }, this.timeoutMs);

    try {
      const response = await fetch(
        `${this.aiServiceUrl}/internal/ai/pricing/estimate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': this.internalServiceSecret,
          },
          body: JSON.stringify({
            service_name: service.name,
            description: dto.description || '',
            base_price_min: catalogMin,
            base_price_max: catalogMax,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `AI service responded with HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!isValidAiPricingPayload(data)) {
        throw new Error(
          `AI service returned invalid pricing payload: min=${data?.ai_ref_price_min}, max=${data?.ai_ref_price_max}`,
        );
      }

      return {
        aiRefPriceMin: Math.round(data.ai_ref_price_min),
        aiRefPriceMax: Math.round(data.ai_ref_price_max),
        matchedReason:
          typeof data.matched_case === 'string' && data.matched_case.trim()
            ? data.matched_case.trim()
            : undefined,
        isFallback: Boolean(data.is_fallback),
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to estimate price via AI service for service '${service.name}' (${dto.serviceId}): ${error?.message || error}. Falling back to catalog base prices.`,
      );

      return {
        aiRefPriceMin: validatedCatalogRange.min,
        aiRefPriceMax: validatedCatalogRange.max,
        matchedReason: undefined,
        isFallback: true,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
