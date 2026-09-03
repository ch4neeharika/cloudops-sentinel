"""Deterministic operational policies.

These are explicitly not machine-learning models. Each rule is a documented
threshold or configuration check used by SREs in production runbooks.
"""

from __future__ import annotations

from collections.abc import Callable

from .models import FindingOut, RecommendationOut, ResourcePayload

REQUIRED_TAGS = ("Environment", "Owner", "CostCenter", "Service")
STATEFUL_TYPES = {"ec2", "s3"}
PRODUCTION_HINTS = {"prod", "production"}


def _is_prod(resource: ResourcePayload) -> bool:
    env = resource.tags.get("Environment", "").lower()
    return env in PRODUCTION_HINTS or "prod" in resource.name.lower()


def rule_low_utilization(resource: ResourcePayload) -> FindingOut | None:
    cpu = float(resource.metrics.get("cpuUtilizationAvg") or 0)
    periods = int(resource.metrics.get("consecutiveLowUtilizationPeriods") or 0)
    if resource.type != "ec2":
        return None
    if cpu < 10 and periods >= 3:
        return FindingOut(
            resourceId=resource.id,
            ruleId="ec2.low_utilization",
            severity="medium",
            title="EC2 instance has persistently low utilization",
            description=(
                "Average CPU has stayed below 10% across consecutive observation "
                "periods. This is a rightsizing signal, not an automatic stop."
            ),
            evidence={
                "cpuUtilizationAvg": cpu,
                "consecutiveLowUtilizationPeriods": periods,
                "threshold": {"cpu": 10, "periods": 3},
            },
            recommendation=RecommendationOut(
                actionType="manual_review",
                explanation="Review instance family and schedule; do not auto-terminate production compute.",
                estimatedImpact="Potential compute cost reduction with downtime risk if sized incorrectly.",
                confidence=0.82,
            ),
        )
    return None


def rule_missing_tags(resource: ResourcePayload) -> FindingOut | None:
    missing = [tag for tag in REQUIRED_TAGS if tag not in resource.tags or not resource.tags[tag]]
    if not missing:
        return None
    return FindingOut(
        resourceId=resource.id,
        ruleId="resource.missing_tags",
        severity="low" if not _is_prod(resource) else "medium",
        title="Resource is missing required operational tags",
        description="Cost allocation, ownership, and incident routing depend on Environment, Owner, CostCenter, and Service.",
        evidence={"missingTags": missing, "presentTags": resource.tags},
        recommendation=RecommendationOut(
            actionType="add_missing_tag",
            explanation=f"Add missing tags {', '.join(missing)} using the allowlisted tagging action.",
            estimatedImpact="No runtime impact; improves ownership and cost reporting.",
            confidence=0.96,
        ),
    )


def rule_public_s3(resource: ResourcePayload) -> FindingOut | None:
    if resource.type != "s3":
        return None
    if resource.config.get("publicAccess") is True:
        return FindingOut(
            resourceId=resource.id,
            ruleId="s3.public_access",
            severity="high",
            title="S3 bucket allows public access",
            description="Public ACLs or a disabled public access block increase data-exfiltration risk.",
            evidence={"publicAccess": True, "encryption": resource.config.get("encryption")},
            recommendation=RecommendationOut(
                actionType="restrict_public_storage",
                explanation="Enable public access block settings unless the bucket is an approved static website.",
                estimatedImpact="May break anonymous reads; confirm CDN origin behavior first.",
                confidence=0.9,
            ),
        )
    return None


def rule_missing_alarms(resource: ResourcePayload) -> FindingOut | None:
    if resource.type == "cloudwatch":
        return None
    alarms = resource.config.get("alarms") or []
    if _is_prod(resource) and len(alarms) == 0:
        return FindingOut(
            resourceId=resource.id,
            ruleId="cloudwatch.missing_alarms",
            severity="medium",
            title="Production resource has no CloudWatch alarms",
            description="Without alarms, failure detection depends on human observation of dashboards.",
            evidence={"alarms": alarms, "environmentHint": "prod"},
            recommendation=RecommendationOut(
                actionType="create_alarm",
                explanation="Create a simulated availability/error alarm as a starting SLO signal.",
                estimatedImpact="Low; additional CloudWatch cost and possible alert noise.",
                confidence=0.78,
            ),
        )
    return None


def rule_unhealthy_service(resource: ResourcePayload) -> FindingOut | None:
    status = resource.config.get("healthCheckStatus")
    if status == "unhealthy":
        return FindingOut(
            resourceId=resource.id,
            ruleId="service.unhealthy",
            severity="critical",
            title="Service health check is failing",
            description="The resource is reporting an unhealthy status from its configured check.",
            evidence={"healthCheckStatus": status, "instanceState": resource.config.get("instanceState")},
            recommendation=RecommendationOut(
                actionType="restart_unhealthy_service",
                explanation="Restart the simulated service after confirming the blast radius.",
                estimatedImpact="Brief interruption; in-flight requests may fail.",
                confidence=0.74,
            ),
        )
    return None


def rule_missing_backup(resource: ResourcePayload) -> FindingOut | None:
    if resource.type not in STATEFUL_TYPES:
        return None
    if resource.config.get("backupEnabled") is False and _is_prod(resource):
        return FindingOut(
            resourceId=resource.id,
            ruleId="resource.missing_backup",
            severity="high",
            title="Stateful production resource has no backup configuration",
            description="A failure or accidental deletion would not have a restore point.",
            evidence={"backupEnabled": False, "type": resource.type},
            recommendation=RecommendationOut(
                actionType="enable_backup_policy",
                explanation="Enable a simulated backup policy (retention to be confirmed by the owner).",
                estimatedImpact="Storage cost increase; no immediate runtime impact.",
                confidence=0.88,
            ),
        )
    return None


def rule_repeated_errors(resource: ResourcePayload) -> FindingOut | None:
    error_rate = float(resource.metrics.get("errorRate") or 0)
    error_count = int(resource.metrics.get("errorCount") or 0)
    if error_rate > 0.05 and error_count > 10:
        return FindingOut(
            resourceId=resource.id,
            ruleId="app.repeated_errors",
            severity="high",
            title="Repeated application errors exceed error-budget threshold",
            description="Error rate is above 5% with a meaningful absolute error count.",
            evidence={"errorRate": error_rate, "errorCount": error_count, "threshold": 0.05},
            recommendation=RecommendationOut(
                actionType="restart_unhealthy_service",
                explanation="If errors correlate with a wedged process, restart; otherwise investigate application logs.",
                estimatedImpact="Possible brief availability hit; may not fix application defects.",
                confidence=0.7,
            ),
        )
    return None


def rule_elevated_latency(resource: ResourcePayload) -> FindingOut | None:
    p99 = float(resource.metrics.get("p99LatencyMs") or 0)
    if p99 > 1000:
        return FindingOut(
            resourceId=resource.id,
            ruleId="api.elevated_latency",
            severity="medium",
            title="Elevated API p99 latency",
            description="p99 latency exceeds 1000ms, which typically breaches user-facing SLOs.",
            evidence={"p99LatencyMs": p99, "thresholdMs": 1000},
            recommendation=RecommendationOut(
                actionType="create_alarm",
                explanation="Create a latency alarm and inspect dependency saturation before scaling.",
                estimatedImpact="Alerting only; no direct user impact from the remediation itself.",
                confidence=0.76,
            ),
        )
    return None


def rule_failure_rate_increase(resource: ResourcePayload) -> FindingOut | None:
    delta = float(resource.metrics.get("failureRateDelta") or 0)
    if delta > 0.1:
        return FindingOut(
            resourceId=resource.id,
            ruleId="reliability.failure_rate_increase",
            severity="high",
            title="Unusual increase in failure rate",
            description="Failure rate rose by more than 10 percentage points versus the previous window.",
            evidence={"failureRateDelta": delta, "threshold": 0.1},
            recommendation=RecommendationOut(
                actionType="create_alarm",
                explanation="Page on further increases and capture a rollback decision record.",
                estimatedImpact="Operational attention; alarm creation is low risk.",
                confidence=0.8,
            ),
        )
    return None


RULES: list[Callable[[ResourcePayload], FindingOut | None]] = [
    rule_low_utilization,
    rule_missing_tags,
    rule_public_s3,
    rule_missing_alarms,
    rule_unhealthy_service,
    rule_missing_backup,
    rule_repeated_errors,
    rule_elevated_latency,
    rule_failure_rate_increase,
]


def evaluate(resource: ResourcePayload) -> list[FindingOut]:
    findings: list[FindingOut] = []
    for rule in RULES:
        result = rule(resource)
        if result is not None:
            findings.append(result)
    return findings
