from __future__ import annotations

from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AI_ROOT = Path(__file__).resolve().parents[4]
PROJECT_ROOT = Path(__file__).resolve().parents[5]


class MatchingSettings(BaseSettings):
    """
    Configuration settings for AI Matching and Ranking service.
    """
    model_name: str = "intfloat/multilingual-e5-small"
    model_cache_dir: str | None = None
    device: str = "cpu"  # 'cpu', 'cuda', or 'mps'

    # Concurrency and batching
    max_concurrent_inferences: int = 4
    candidate_batch_size: int = 32
    embedding_cache_size: int = 10000

    # Input length and limits
    max_text_chars: int = 2000
    max_candidates_per_request: int = 100
    default_top_n: int = 20

    # Baseline weights (Unvalidated Baseline ADR-MATCHING-001)
    weight_semantic: float = 0.30
    weight_geo: float = 0.25
    weight_rating: float = 0.20
    weight_experience: float = 0.15
    weight_completion: float = 0.10

    # Semantic calibration parameters: E5 embeddings occupy [0.70, 0.95] for natural language.
    # Calibrating this narrow band to [0, 100] preserves necessary discriminatory power in hybrid ranking.
    enable_semantic_calibration: bool = True
    semantic_calib_min: float = 0.75
    semantic_calib_max: float = 0.90

    # Bayesian rating prior constants
    rating_prior_mean: float = 4.5
    rating_prior_weight: float = 5.0

    # Cold-start neutral priors
    cold_start_completion_prior: float = 80.0

    # Experience normalization cap (years)
    experience_cap_years: float = 10.0

    # Security
    internal_service_secret: str = Field(
        default="handy-go-internal-service-secret-key-12345",
        validation_alias="INTERNAL_SERVICE_SECRET",
    )
    debug: bool = Field(default=False, validation_alias="DEBUG")

    model_config = SettingsConfigDict(
        env_file=[AI_ROOT / ".env", PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )


matching_settings = MatchingSettings()
