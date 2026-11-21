from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from app.domains.matching.services.embedding_service import MultilingualE5Service
from app.domains.pricing.schemas.pricing import EstimatePricingResponse
from app.domains.pricing.utils.rounding import sanitize_price_range

logger = logging.getLogger("pricing.engine")

BENCHMARKS_FILE = Path(__file__).parent.parent / "data" / "pricing_benchmarks.json"


class PricingEngineService:
    def __init__(self, benchmarks_path: Path | None = None) -> None:
        self.benchmarks_path = benchmarks_path or BENCHMARKS_FILE
        self._benchmarks: list[dict[str, Any]] = self._load_benchmarks()
        self._embedding_service = MultilingualE5Service.get_instance()

    def _load_benchmarks(self) -> list[dict[str, Any]]:
        try:
            if not self.benchmarks_path.exists():
                logger.warning("Benchmarks file %s not found", self.benchmarks_path)
                return []
            with open(self.benchmarks_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.error("Failed to load pricing benchmarks: %s", e)
            return []

    def _filter_benchmarks_for_service(
        self, service_name: str
    ) -> list[dict[str, Any]]:
        normalized_service = (service_name or "").lower().strip()
        matched: list[dict[str, Any]] = []

        for b in self._benchmarks:
            keywords = [k.lower().strip() for k in b.get("service_keywords", [])]
            if any(k in normalized_service for k in keywords):
                matched.append(b)

        # If no specific keyword match, use all benchmarks
        return matched if matched else self._benchmarks

    async def estimate_price(
        self,
        service_name: str,
        description: str | None,
        base_price_min: float | None = None,
        base_price_max: float | None = None,
    ) -> EstimatePricingResponse:
        clean_desc = (description or "").strip()
        has_valid_desc = len(clean_desc) >= 5

        # Safety floor and ceiling
        floor = base_price_min if (base_price_min and base_price_min > 0) else 50_000
        ceiling = (
            (base_price_max * 1.5)
            if (base_price_max and base_price_max > 0)
            else 20_000_000
        )

        # Baseline fallback values
        fallback_min = base_price_min or 150_000
        fallback_max = base_price_max or 350_000

        if not has_valid_desc or not self._benchmarks:
            sanitized_min, sanitized_max = sanitize_price_range(
                fallback_min, fallback_max, floor=floor, ceiling=ceiling
            )
            return EstimatePricingResponse(
                status="success",
                ai_ref_price_min=sanitized_min,
                ai_ref_price_max=sanitized_max,
                matched_case=None,
                confidence=0.0,
                is_fallback=True,
            )

        relevant_benchmarks = self._filter_benchmarks_for_service(service_name)
        if not relevant_benchmarks:
            sanitized_min, sanitized_max = sanitize_price_range(
                fallback_min, fallback_max, floor=floor, ceiling=ceiling
            )
            return EstimatePricingResponse(
                status="success",
                ai_ref_price_min=sanitized_min,
                ai_ref_price_max=sanitized_max,
                matched_case=None,
                confidence=0.0,
                is_fallback=True,
            )

        # Flatten patterns to compute embeddings
        pattern_to_benchmark: list[tuple[str, dict[str, Any]]] = []
        for b in relevant_benchmarks:
            for p in b.get("description_patterns", []):
                pattern_to_benchmark.append((p, b))

        if not pattern_to_benchmark:
            sanitized_min, sanitized_max = sanitize_price_range(
                fallback_min, fallback_max, floor=floor, ceiling=ceiling
            )
            return EstimatePricingResponse(
                status="success",
                ai_ref_price_min=sanitized_min,
                ai_ref_price_max=sanitized_max,
                matched_case=None,
                confidence=0.0,
                is_fallback=True,
            )

        query_emb = await self._embedding_service.encode_query(clean_desc)
        passages = [p[0] for p in pattern_to_benchmark]
        passage_embs = await self._embedding_service.encode_passages(passages)

        if not passage_embs:
            sanitized_min, sanitized_max = sanitize_price_range(
                fallback_min, fallback_max, floor=floor, ceiling=ceiling
            )
            return EstimatePricingResponse(
                status="success",
                ai_ref_price_min=sanitized_min,
                ai_ref_price_max=sanitized_max,
                matched_case=None,
                confidence=0.0,
                is_fallback=True,
            )

        matrix = np.stack(passage_embs, axis=0)
        similarities = np.dot(matrix, query_emb)

        # Aggregate similarity per benchmark case
        benchmark_best_sim: dict[str, tuple[float, dict[str, Any]]] = {}
        for idx, (pattern, benchmark) in enumerate(pattern_to_benchmark):
            case_name = benchmark["case_name"]
            sim = float(similarities[idx])
            if case_name not in benchmark_best_sim or sim > benchmark_best_sim[case_name][0]:
                benchmark_best_sim[case_name] = (sim, benchmark)

        # Pick highest scoring benchmark case
        best_case_name, (best_sim, best_benchmark) = max(
            benchmark_best_sim.items(), key=lambda item: item[1][0]
        )

        # Multilingual E5 Small practical semantic baseline is ~0.75-0.84 for unrelated text.
        # Strong problem symptom match requires cosine similarity >= 0.85.
        CONFIDENCE_THRESHOLD = 0.85
        if best_sim < CONFIDENCE_THRESHOLD:
            sanitized_min, sanitized_max = sanitize_price_range(
                fallback_min, fallback_max, floor=floor, ceiling=ceiling
            )
            return EstimatePricingResponse(
                status="success",
                ai_ref_price_min=sanitized_min,
                ai_ref_price_max=sanitized_max,
                matched_case=None,
                confidence=round(best_sim, 4),
                is_fallback=True,
            )

        target_min = best_benchmark.get("price_min", fallback_min)
        target_max = best_benchmark.get("price_max", fallback_max)

        sanitized_min, sanitized_max = sanitize_price_range(
            target_min, target_max, floor=floor, ceiling=ceiling
        )

        return EstimatePricingResponse(
            status="success",
            ai_ref_price_min=sanitized_min,
            ai_ref_price_max=sanitized_max,
            matched_case=best_case_name,
            confidence=round(best_sim, 4),
            is_fallback=False,
        )
