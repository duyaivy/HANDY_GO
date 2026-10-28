from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class RankingCandidateInput(BaseModel):
    workerUserId: str = Field(
        ...,
        description="Unique identifier of candidate worker",
        json_schema_extra={"example": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
    )
    offeringTitle: str = Field(
        default="",
        description="Title of registered service offering",
        json_schema_extra={"example": "Thợ sửa điện lạnh chuyên nghiệp"},
    )
    offeringDescription: str = Field(
        default="",
        description="Detailed description of trade skills and offerings",
        json_schema_extra={"example": "Chuyên sửa máy lạnh, vệ sinh điều hòa, kiểm tra gas và xử lý nước chảy."},
    )
    distanceKm: float = Field(
        ...,
        ge=0.0,
        description="Calculated distance in km between request and worker service area center",
        json_schema_extra={"example": 2.4},
    )
    radiusKm: float = Field(
        ...,
        gt=0.0,
        description="Registered service radius of candidate in km",
        json_schema_extra={"example": 10.0},
    )
    averageRating: float = Field(
        default=0.0,
        ge=0.0,
        le=5.0,
        description="Average customer star rating (0.0 to 5.0)",
        json_schema_extra={"example": 4.85},
    )
    ratingCount: int = Field(
        default=0,
        ge=0,
        description="Total count of customer ratings received",
        json_schema_extra={"example": 42},
    )
    experienceYears: float = Field(
        default=0.0,
        ge=0.0,
        description="Registered domain tenure in years for this trade",
        json_schema_extra={"example": 5.0},
    )
    historicalCompletionRate: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Order completion rate (0.0 to 1.0) from Order Service",
        json_schema_extra={"example": 0.98},
    )


class SimulationOptionsDto(BaseModel):
    simulateTimeoutMs: int | None = Field(default=None, ge=0)
    simulateError: bool | None = Field(default=None)
    simulateEmpty: bool | None = Field(default=None)


class RankingRequestDto(BaseModel):
    serviceRequestId: str = Field(
        ...,
        description="UUID of the Service Request",
        json_schema_extra={"example": "f47ac10b-58cc-4372-a567-0e02b2c3d479"},
    )
    requestRevision: int = Field(
        ...,
        ge=1,
        description="Revision number of the Service Request",
        json_schema_extra={"example": 1},
    )
    serviceId: str = Field(
        ...,
        description="Catalog Service Category / Offering ID",
        json_schema_extra={"example": "srv-ac-1234"},
    )
    requestDescription: str = Field(
        ...,
        description="Customer-provided problem description",
        json_schema_extra={"example": "Máy lạnh nhà tôi không lạnh và bị chảy nước, cần thợ sửa chữa gấp."},
    )
    requestLatitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude coordinates of service location",
        json_schema_extra={"example": 10.772000},
    )
    requestLongitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude coordinates of service location",
        json_schema_extra={"example": 106.698300},
    )
    candidates: list[RankingCandidateInput] = Field(
        default_factory=list,
        description="Pool of eligible candidate workers discovered by Matching Orchestrator",
    )
    topN: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of top-ranked candidates to return",
        json_schema_extra={"example": 20},
    )
    simulationOptions: SimulationOptionsDto | None = Field(
        default=None,
        description="Optional simulation controls for resilience/chaos testing",
    )


class ScoreBreakdownDto(BaseModel):
    semanticScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Normalized semantic similarity score [0, 100]",
    )
    geoScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Normalized geographic proximity score [0, 100]",
    )
    ratingScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Normalized Bayesian rating quality score [0, 100]",
    )
    experienceScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Normalized service tenure experience score [0, 100]",
    )
    completionScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Normalized historical order completion score [0, 100]",
    )


class RankedWorkerMetadataDto(BaseModel):
    isSyntheticSemanticScore: bool | None = Field(default=False)
    renormalizedWeights: bool | None = Field(default=False)
    embeddingDimension: int | None = Field(default=384)
    inferenceDurationMs: float | None = Field(default=None)
    effectiveWeights: dict[str, float] | None = Field(default=None)


class RankedWorkerOutput(BaseModel):
    workerUserId: str = Field(..., description="Worker User UUID")
    rank: int = Field(..., ge=1, description="Sequential rank (1..N)")
    matchingScore: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Composite matching score [0.00, 100.00]",
    )
    scoreBreakdown: ScoreBreakdownDto
    metadata: RankedWorkerMetadataDto | None = None


class RankingResponseDto(BaseModel):
    modelVersion: str = Field(
        ...,
        description="Identifier of embedding model, revision and algorithm version",
        json_schema_extra={"example": "intfloat/multilingual-e5-small-v1.0"},
    )
    providerType: Literal["real_ai", "mock", "fallback"] = Field(
        default="real_ai",
        description="Ranking provider type ('real_ai')",
    )
    rankedWorkers: list[RankedWorkerOutput] = Field(
        default_factory=list,
        description="Sequential list of ranked candidate workers",
    )
    generatedAt: str = Field(
        ...,
        description="ISO 8601 UTC timestamp of inference execution",
    )


class ReadinessResponse(BaseModel):
    status: Literal["ready", "loading", "error"]
    modelLoaded: bool
    modelName: str
    device: str
    embeddingDimension: int
    cacheSize: int
    maxConcurrentInferences: int
