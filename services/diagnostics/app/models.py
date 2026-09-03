from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]
ActionType = Literal[
    "add_missing_tag",
    "create_alarm",
    "enable_backup_policy",
    "restart_unhealthy_service",
    "restrict_public_storage",
    "manual_review",
]


class ResourcePayload(BaseModel):
    id: str
    type: str
    region: str
    name: str
    tags: dict[str, str] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)


class AnalyzeRequest(BaseModel):
    workspaceId: str
    correlationId: str
    resources: list[ResourcePayload]


class RecommendationOut(BaseModel):
    actionType: ActionType
    explanation: str
    estimatedImpact: str
    confidence: float = Field(ge=0, le=1)


class FindingOut(BaseModel):
    resourceId: str
    ruleId: str
    severity: Severity
    title: str
    description: str
    evidence: dict[str, Any]
    recommendation: RecommendationOut


class AnalyzeResponse(BaseModel):
    engine: str = "deterministic-operational-policies"
    findings: list[FindingOut]
