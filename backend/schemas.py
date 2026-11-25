"""Shared Pydantic data schemas across providers, agents, models, and storage."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SourceProvenance(BaseModel):
    source_name: str
    source_url: str
    published_at: str | None = None
    fetched_at: str
    verification_status: Literal["verified", "unconfirmed", "fallback"] = "verified"
    data_type: str
    is_demo: bool = False


class SourceHealthStatus(BaseModel):
    source_id: str
    status: Literal["healthy", "degraded", "down", "untested", "disabled"]
    last_success_at: str | None = None
    last_error_at: str | None = None
    last_error_message: str | None = None
    latency_ms: int | None = None
    http_status: int | None = None
    records_fetched: int = 0
    coverage_summary: str = ""
    updated_at: str


class FixtureRecord(BaseModel):
    fixture_id: str
    iddaa_event_id: str | None = None
    iddaa_match_code: str | None = None
    organization_id: str
    league_name: str
    country: str
    home_team: str
    away_team: str
    home_team_id: str | None = None
    away_team_id: str | None = None
    kickoff_utc: str
    kickoff_tr: str
    analysis_day_tr: str
    status: Literal["scheduled", "live", "finished", "postponed", "cancelled"] = "scheduled"
    bulletin_source: str
    iddaa_verified: bool = False
    available_markets: list[str] = Field(default_factory=list)
    iddaa_odds: dict[str, Any] = Field(default_factory=dict)
    is_demo: bool = False
    provenance: SourceProvenance


class HistoricalMatch(BaseModel):
    match_id: str
    organization_id: str
    season: str
    match_date_utc: str
    home_team: str
    away_team: str
    home_goals: int
    away_goals: int
    ht_home_goals: int | None = None
    ht_away_goals: int | None = None
    xg_home: float | None = None
    xg_away: float | None = None
    shots_home: int | None = None
    shots_away: int | None = None
    source_name: str
    source_url: str


class TeamStandingRow(BaseModel):
    organization_id: str
    team_name: str
    rank: int
    played: int
    wins: int
    draws: int
    losses: int
    goals_for: int
    goals_against: int
    points: int
    source_name: str
    source_url: str
    fetched_at: str


class NewsItem(BaseModel):
    title: str
    summary: str | None = None
    team_tag: str | None = None
    organization_id: str | None = None
    source_name: str
    source_url: str
    published_at: str | None = None
    fetched_at: str
    verification_status: Literal["verified", "unconfirmed"] = "verified"


class AgentOutput(BaseModel):
    agent_id: str
    agent_name: str
    fixture_id: str
    status: Literal["ok", "partial", "insufficient_data", "error"]
    data_coverage: float = Field(ge=0.0, le=1.0)
    summary_tr: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    provenance: list[SourceProvenance] = Field(default_factory=list)


class MarketCategoryProbability(BaseModel):
    available: bool
    reason: str | None = None
    probabilities: dict[str, float] = Field(default_factory=dict)
    extra: dict[str, Any] = Field(default_factory=dict)


class MatchPredictionBundle(BaseModel):
    prediction_id: str
    run_id: str
    fixture: FixtureRecord
    model_version: str
    prob_home: float = Field(ge=0.0, le=1.0)
    prob_draw: float = Field(ge=0.0, le=1.0)
    prob_away: float = Field(ge=0.0, le=1.0)
    prob_btts_yes: float | None = None
    prob_over_25: float | None = None
    markets: dict[str, MarketCategoryProbability] = Field(default_factory=dict)
    model_breakdown: dict[str, dict[str, float]] = Field(default_factory=dict)
    data_coverage_score: float = Field(ge=0.0, le=1.0)
    research_quality_score: float = Field(ge=0.0, le=1.0)
    agent_outputs: list[AgentOutput] = Field(default_factory=list)
    created_at_utc: str
    is_demo: bool = False
