import { DiagnosticJobModel } from '../db/models';
import { exponentialBackoffWithJitter } from '../observability/retry';
import type { StructuredFailure } from '../types';

export interface JobQueueConfig {
  leaseMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export class JobQueue {
  constructor(private readonly config: JobQueueConfig) {}

  async claim(workerId: string) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + this.config.leaseMs);
    return DiagnosticJobModel.findOneAndUpdate(
      {
        status: { $in: ['pending', 'retry_wait'] },
        nextRunAt: { $lte: now },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
      },
      {
        $set: {
          status: 'running',
          claimedBy: workerId,
          leaseUntil,
          heartbeatAt: now,
        },
        $inc: { attempts: 1, version: 1 },
      },
      { new: true },
    ).exec();
  }

  async heartbeat(jobId: string, workerId: string) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + this.config.leaseMs);
    return DiagnosticJobModel.findOneAndUpdate(
      { _id: jobId, claimedBy: workerId, status: 'running' },
      { $set: { heartbeatAt: now, leaseUntil } },
      { new: true },
    ).exec();
  }

  async complete(
    jobId: string,
    summary: { resourcesScanned: number; findingsCreated: number; recommendationsCreated: number },
  ) {
    return DiagnosticJobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'completed',
          resultSummary: summary,
          completedAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      },
      { new: true },
    ).exec();
  }

  async fail(jobId: string, error: StructuredFailure) {
    const job = await DiagnosticJobModel.findById(jobId).exec();
    if (!job) return null;
    const attempts = job.attempts;
    if (attempts >= job.maxAttempts || !error.retryable) {
      return DiagnosticJobModel.findByIdAndUpdate(
        jobId,
        {
          $set: {
            status: 'dead_lettered',
            lastError: error,
            leaseUntil: null,
            completedAt: new Date(),
          },
        },
        { new: true },
      ).exec();
    }
    const delay = exponentialBackoffWithJitter({
      attempt: attempts,
      baseMs: this.config.backoffBaseMs,
      maxMs: this.config.backoffMaxMs,
    });
    return DiagnosticJobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'retry_wait',
          lastError: error,
          leaseUntil: null,
          nextRunAt: new Date(Date.now() + delay),
        },
      },
      { new: true },
    ).exec();
  }

  async recoverAbandoned(now = new Date()) {
    const result = await DiagnosticJobModel.updateMany(
      {
        status: 'running',
        leaseUntil: { $lte: now },
      },
      {
        $set: {
          status: 'retry_wait',
          nextRunAt: now,
          leaseUntil: null,
          claimedBy: null,
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  async pendingDepth() {
    return DiagnosticJobModel.countDocuments({
      status: { $in: ['pending', 'retry_wait'] },
    }).exec();
  }
}
