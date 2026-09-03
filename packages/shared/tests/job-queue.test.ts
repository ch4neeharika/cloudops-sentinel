import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { DiagnosticJobModel } from '../src/db/models';
import { JobQueue } from '../src/jobs/queue';

describe('JobQueue', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await DiagnosticJobModel.deleteMany({});
  });

  async function enqueue(overrides: Record<string, unknown> = {}) {
    return DiagnosticJobModel.create({
      workspaceId: 'ws1',
      status: 'pending',
      idempotencyKey: `key-${Math.random().toString(16).slice(2)}`,
      correlationId: 'corr-1',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date(Date.now() - 10),
      createdBy: 'u1',
      timeoutMs: 5000,
      version: 1,
      ...overrides,
    });
  }

  it('atomically claims a pending job and increments attempts', async () => {
    const queue = new JobQueue({
      leaseMs: 30_000,
      maxAttempts: 3,
      backoffBaseMs: 50,
      backoffMaxMs: 200,
    });
    await enqueue();
    const first = await queue.claim('worker-a');
    const second = await queue.claim('worker-b');
    expect(first).not.toBeNull();
    expect(first?.claimedBy).toBe('worker-a');
    expect(first?.status).toBe('running');
    expect(first?.attempts).toBe(1);
    expect(second).toBeNull();
  });

  it('retries with backoff then dead-letters after max attempts', async () => {
    const queue = new JobQueue({
      leaseMs: 30_000,
      maxAttempts: 2,
      backoffBaseMs: 10,
      backoffMaxMs: 20,
    });
    const job = await enqueue({ maxAttempts: 2, attempts: 0 });
    await queue.claim('w1');
    const retried = await queue.fail(job._id.toString(), {
      code: 'TIMEOUT',
      message: 'timed out',
      retryable: true,
      at: new Date(),
    });
    expect(retried?.status).toBe('retry_wait');

    await DiagnosticJobModel.findByIdAndUpdate(job._id, { nextRunAt: new Date(Date.now() - 1) });
    await queue.claim('w1');
    const dead = await queue.fail(job._id.toString(), {
      code: 'TIMEOUT',
      message: 'timed out again',
      retryable: true,
      at: new Date(),
    });
    expect(dead?.status).toBe('dead_lettered');
  });

  it('recovers abandoned jobs whose lease expired', async () => {
    const queue = new JobQueue({ leaseMs: 1, maxAttempts: 3, backoffBaseMs: 10, backoffMaxMs: 20 });
    await enqueue({
      status: 'running',
      claimedBy: 'dead-worker',
      leaseUntil: new Date(Date.now() - 1000),
      attempts: 1,
    });
    const recovered = await queue.recoverAbandoned();
    expect(recovered).toBe(1);
    const job = await DiagnosticJobModel.findOne({ workspaceId: 'ws1' });
    expect(job?.status).toBe('retry_wait');
    expect(job?.claimedBy).toBeNull();
  });

  it('does not move non-retryable failures to retry_wait', async () => {
    const queue = new JobQueue({
      leaseMs: 30_000,
      maxAttempts: 5,
      backoffBaseMs: 10,
      backoffMaxMs: 20,
    });
    const job = await enqueue({ maxAttempts: 5 });
    await queue.claim('w1');
    const failed = await queue.fail(job._id.toString(), {
      code: 'VALIDATION',
      message: 'bad payload',
      retryable: false,
      at: new Date(),
    });
    expect(failed?.status).toBe('dead_lettered');
  });
});
