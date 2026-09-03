import {
  CloudResourceModel,
  DiagnosticsClient,
  FindingModel,
  HealthCheckModel,
  JobQueue,
  RecommendationModel,
  type DiagnosticEngineResult,
  type Logger,
  type Metrics,
  withTimeout,
} from '@cloudops/shared';
import type { WorkerConfig } from './config';

export class JobProcessor {
  constructor(
    private readonly config: WorkerConfig,
    private readonly queue: JobQueue,
    private readonly diagnostics: DiagnosticsClient,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
  ) {}

  async processNext(): Promise<boolean> {
    const job = await this.queue.claim(this.config.WORKER_ID);
    if (!job) return false;
    const started = Date.now();
    const heartbeat = setInterval(() => {
      void this.queue.heartbeat(job._id.toString(), this.config.WORKER_ID);
    }, this.config.WORKER_HEARTBEAT_MS);

    try {
      const result = await withTimeout(
        this.run(
          job.workspaceId,
          job._id.toString(),
          job.correlationId,
          job.resourceIds ?? undefined,
          job.resourceTypes ?? undefined,
        ),
        job.timeoutMs,
        'Job execution timed out',
      );
      await this.queue.complete(job._id.toString(), result);
      this.metrics.jobProcessingDuration.observe(
        { status: 'completed' },
        (Date.now() - started) / 1000,
      );
      this.logger.info(
        { jobId: job._id.toString(), correlationId: job.correlationId, ...result },
        'job completed',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = !message.includes('not retryable');
      const updated = await this.queue.fail(job._id.toString(), {
        code: message.includes('timed out') ? 'TIMEOUT' : 'PROCESSING_ERROR',
        message,
        retryable,
        cause: err instanceof Error ? err.name : undefined,
        at: new Date(),
      });
      if (updated?.status === 'dead_lettered') {
        this.metrics.jobDeadLetterTotal.inc();
      } else {
        this.metrics.jobRetriesTotal.inc();
      }
      this.metrics.jobProcessingDuration.observe(
        { status: updated?.status ?? 'failed' },
        (Date.now() - started) / 1000,
      );
      this.logger.error(
        { err, jobId: job._id.toString(), correlationId: job.correlationId },
        'job failed',
      );
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  private async run(
    workspaceId: string,
    jobId: string,
    correlationId: string,
    resourceIds?: string[],
    resourceTypes?: string[],
  ) {
    const filter: Record<string, unknown> = { workspaceId };
    if (resourceIds?.length) filter._id = { $in: resourceIds };
    if (resourceTypes?.length) filter.type = { $in: resourceTypes };
    const resources = await CloudResourceModel.find(filter);
    const payload = resources.map((r) => ({
      id: r._id.toString(),
      type: r.type,
      region: r.region,
      name: r.name,
      tags: (r.tags ?? {}) as Record<string, string>,
      config: (r.config ?? {}) as Record<string, unknown>,
      metrics: (r.metrics ?? {}) as Record<string, unknown>,
    }));

    const analysis: DiagnosticEngineResult = await this.diagnostics.analyze({
      workspaceId,
      correlationId,
      resources: payload,
    });

    let findingsCreated = 0;
    let recommendationsCreated = 0;
    for (const finding of analysis.findings) {
      const stored = await FindingModel.findOneAndUpdate(
        { workspaceId, jobId, resourceId: finding.resourceId, ruleId: finding.ruleId },
        {
          $set: {
            severity: finding.severity,
            title: finding.title,
            description: finding.description,
            evidence: finding.evidence,
            correlationId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      findingsCreated += 1;
      await RecommendationModel.findOneAndUpdate(
        { workspaceId, findingId: stored._id.toString() },
        {
          $set: {
            jobId,
            resourceId: finding.resourceId,
            actionType: finding.recommendation.actionType,
            explanation: finding.recommendation.explanation,
            estimatedImpact: finding.recommendation.estimatedImpact,
            confidence: finding.recommendation.confidence,
            correlationId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      recommendationsCreated += 1;

      const unhealthy = finding.severity === 'critical' || finding.severity === 'high';
      await HealthCheckModel.create({
        workspaceId,
        resourceId: finding.resourceId,
        status: unhealthy ? 'unhealthy' : 'degraded',
        checks: [{ name: finding.ruleId, passed: false, detail: finding.title }],
        observedAt: new Date(),
      });
    }

    return { resourcesScanned: resources.length, findingsCreated, recommendationsCreated };
  }
}
