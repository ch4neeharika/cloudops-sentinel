import {
  ConflictError,
  DiagnosticJobModel,
  NotFoundError,
  recordAudit,
  serialize,
} from '@cloudops/shared';

export class JobService {
  constructor(
    private readonly maxAttempts: number,
    private readonly timeoutMs: number,
  ) {}

  async create(
    workspaceId: string,
    actorId: string,
    correlationId: string,
    input: { resourceIds?: string[]; resourceTypes?: string[]; idempotencyKey: string },
  ) {
    const existing = await DiagnosticJobModel.findOne({
      workspaceId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      return { job: serialize(existing), replayed: true };
    }
    try {
      const job = await DiagnosticJobModel.create({
        workspaceId,
        status: 'pending',
        resourceIds: input.resourceIds,
        resourceTypes: input.resourceTypes,
        idempotencyKey: input.idempotencyKey,
        correlationId,
        attempts: 0,
        maxAttempts: this.maxAttempts,
        nextRunAt: new Date(),
        createdBy: actorId,
        timeoutMs: this.timeoutMs,
        version: 1,
      });
      await recordAudit({
        workspaceId,
        actorId,
        action: 'diagnostics.create',
        resourceType: 'DiagnosticJob',
        resourceId: job._id.toString(),
        correlationId,
        metadata: { idempotencyKey: input.idempotencyKey },
      });
      return { job: serialize(job), replayed: false };
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const replay = await DiagnosticJobModel.findOne({
          workspaceId,
          idempotencyKey: input.idempotencyKey,
        });
        if (replay) return { job: serialize(replay), replayed: true };
      }
      throw err;
    }
  }

  async list(workspaceId: string, query: { page: number; limit: number; status?: string }) {
    const filter: Record<string, unknown> = { workspaceId };
    if (query.status) filter.status = query.status;
    const total = await DiagnosticJobModel.countDocuments(filter);
    const docs = await DiagnosticJobModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit);
    return { items: docs.map(serialize), page: query.page, limit: query.limit, total };
  }

  async get(workspaceId: string, id: string) {
    const doc = await DiagnosticJobModel.findOne({ _id: id, workspaceId });
    return doc ? serialize(doc) : null;
  }

  async retry(workspaceId: string, id: string, actorId: string, correlationId: string) {
    const job = await DiagnosticJobModel.findOne({ _id: id, workspaceId });
    if (!job) throw new NotFoundError('Job not found');
    if (!['failed', 'dead_lettered'].includes(job.status)) {
      throw new ConflictError(`Job cannot be retried from status ${job.status}`);
    }
    job.status = 'pending';
    job.nextRunAt = new Date();
    job.attempts = 0;
    job.leaseUntil = null;
    job.claimedBy = null;
    job.lastError = null;
    job.completedAt = null;
    await job.save();
    await recordAudit({
      workspaceId,
      actorId,
      action: 'jobs.retry',
      resourceType: 'DiagnosticJob',
      resourceId: id,
      correlationId,
    });
    return serialize(job);
  }
}
