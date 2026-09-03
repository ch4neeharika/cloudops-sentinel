from fastapi.testclient import TestClient

from app.engine import evaluate
from app.main import app
from app.models import ResourcePayload

client = TestClient(app)


def test_live_and_ready() -> None:
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").json()["engine"] == "deterministic-operational-policies"


def test_low_utilization_rule() -> None:
    resource = ResourcePayload(
        id="i1",
        type="ec2",
        region="us-east-1",
        name="web",
        tags={"Environment": "prod"},
        config={},
        metrics={"cpuUtilizationAvg": 3.0, "consecutiveLowUtilizationPeriods": 6},
    )
    findings = evaluate(resource)
    assert any(f.ruleId == "ec2.low_utilization" for f in findings)


def test_missing_tags_rule() -> None:
    resource = ResourcePayload(id="i1", type="ec2", region="us-east-1", name="x", tags={})
    findings = evaluate(resource)
    missing = next(f for f in findings if f.ruleId == "resource.missing_tags")
    assert missing.recommendation.actionType == "add_missing_tag"


def test_public_s3_rule() -> None:
    resource = ResourcePayload(
        id="b1",
        type="s3",
        region="us-east-1",
        name="public",
        config={"publicAccess": True},
    )
    assert any(f.ruleId == "s3.public_access" for f in evaluate(resource))


def test_missing_alarms_only_for_prod() -> None:
    prod = ResourcePayload(
        id="l1",
        type="lambda",
        region="us-east-1",
        name="ingest",
        tags={"Environment": "prod"},
        config={"alarms": []},
    )
    dev = ResourcePayload(
        id="l2",
        type="lambda",
        region="us-east-1",
        name="ingest-dev",
        tags={"Environment": "dev"},
        config={"alarms": []},
    )
    assert any(f.ruleId == "cloudwatch.missing_alarms" for f in evaluate(prod))
    assert not any(f.ruleId == "cloudwatch.missing_alarms" for f in evaluate(dev))


def test_unhealthy_backup_errors_latency_and_delta() -> None:
    resource = ResourcePayload(
        id="api",
        type="ec2",
        region="us-east-1",
        name="api-prod",
        tags={"Environment": "prod", "Owner": "a", "CostCenter": "c", "Service": "s"},
        config={"healthCheckStatus": "unhealthy", "backupEnabled": False, "alarms": ["x"]},
        metrics={
            "errorRate": 0.2,
            "errorCount": 40,
            "p99LatencyMs": 2500,
            "failureRateDelta": 0.3,
        },
    )
    ids = {f.ruleId for f in evaluate(resource)}
    assert "service.unhealthy" in ids
    assert "resource.missing_backup" in ids
    assert "app.repeated_errors" in ids
    assert "api.elevated_latency" in ids
    assert "reliability.failure_rate_increase" in ids


def test_analyze_endpoint_is_deterministic() -> None:
    payload = {
        "workspaceId": "ws",
        "correlationId": "c1",
        "resources": [
            {
                "id": "b1",
                "type": "s3",
                "region": "us-east-1",
                "name": "public",
                "tags": {"Environment": "prod"},
                "config": {"publicAccess": True, "backupEnabled": True, "alarms": ["x"]},
                "metrics": {},
            }
        ],
    }
    first = client.post("/v1/analyze", json=payload).json()
    second = client.post("/v1/analyze", json=payload).json()
    assert first == second
    assert first["engine"] == "deterministic-operational-policies"
    assert {f["ruleId"] for f in first["findings"]} >= {"s3.public_access", "resource.missing_tags"}
