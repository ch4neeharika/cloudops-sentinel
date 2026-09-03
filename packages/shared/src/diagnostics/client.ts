import { DependencyError } from '../errors';
import { CircuitBreaker } from '../observability/circuit-breaker';
import { withTimeout } from '../observability/retry';

export interface DiagnosticRequestResource {
  id: string;
  type: string;
  region: string;
  name: string;
  tags: Record<string, string>;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

export interface DiagnosticEngineResult {
  findings: Array<{
    resourceId: string;
    ruleId: string;
    severity: string;
    title: string;
    description: string;
    evidence: Record<string, unknown>;
    recommendation: {
      actionType: string;
      explanation: string;
      estimatedImpact: string;
      confidence: number;
    };
  }>;
}

export class DiagnosticsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly breaker: CircuitBreaker,
  ) {}

  async analyze(payload: {
    workspaceId: string;
    correlationId: string;
    resources: DiagnosticRequestResource[];
  }): Promise<DiagnosticEngineResult> {
    return this.breaker.exec(async () => {
      const controller = new AbortController();
      const response = await withTimeout(
        fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/analyze`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': payload.correlationId,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }),
        this.timeoutMs,
        'Diagnostics service timed out',
      );
      if (!response.ok) {
        throw new DependencyError(
          `Diagnostics returned HTTP ${response.status}`,
          response.status >= 500,
        );
      }
      return (await response.json()) as DiagnosticEngineResult;
    });
  }

  async ready(): Promise<boolean> {
    try {
      const response = await withTimeout(
        fetch(`${this.baseUrl.replace(/\/$/, '')}/health/ready`),
        this.timeoutMs,
        'Diagnostics readiness timed out',
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
