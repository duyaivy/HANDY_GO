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

    const rawTimeout = process.env.AI_PRICING_TIMEOUT_MS
      ? parseInt(process.env.AI_PRICING_TIMEOUT_MS, 10)
      : 2500;
    this.timeoutMs = !isNaN(rawTimeout) && rawTimeout > 0 ? rawTimeout : 2500;

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
    const catalogMin = service.base_price_min
      ? Number(service.base_price_min)
      : 150000;
    const catalogMax = service.base_price_max
      ? Number(service.base_price_max)
      : 350000;

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
            base_price_min: service.base_price_min
              ? Number(service.base_price_min)
              : undefined,
            base_price_max: service.base_price_max
              ? Number(service.base_price_max)
              : undefined,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `AI service responded with HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as AiPricingApiResponse;

      return {
        aiRefPriceMin: Math.round(data.ai_ref_price_min),
        aiRefPriceMax: Math.round(data.ai_ref_price_max),
        matchedReason: data.matched_case || undefined,
        isFallback: Boolean(data.is_fallback),
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to estimate price via AI service for service '${service.name}' (${dto.serviceId}): ${error?.message || error}. Falling back to catalog base prices.`,
      );

      return {
        aiRefPriceMin: Math.round(catalogMin),
        aiRefPriceMax: Math.round(catalogMax),
        matchedReason: undefined,
        isFallback: true,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
