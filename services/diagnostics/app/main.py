from time import perf_counter

from fastapi import FastAPI, Header, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from .engine import evaluate
from .models import AnalyzeRequest, AnalyzeResponse

REQUESTS = Counter(
    "diagnostics_requests_total",
    "Analyze requests",
    ["result"],
)
DURATION = Histogram(
    "diagnostics_analyze_duration_seconds",
    "Analyze duration",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
)

app = FastAPI(
    title="CloudOps Sentinel Diagnostics",
    version="1.0.0",
    description="Deterministic operational policy engine. Not a machine-learning model.",
)


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/health/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "engine": "deterministic-operational-policies"}


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/analyze", response_model=AnalyzeResponse)
def analyze(
    payload: AnalyzeRequest,
    x_correlation_id: str | None = Header(default=None),
) -> AnalyzeResponse:
    started = perf_counter()
    findings = []
    for resource in payload.resources:
        findings.extend(evaluate(resource))
    DURATION.observe(perf_counter() - started)
    REQUESTS.labels("ok").inc()
    return AnalyzeResponse(findings=findings)
