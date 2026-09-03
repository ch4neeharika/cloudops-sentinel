import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  CloudResourceModel,
  DiagnosticJobModel,
  DiagnosticsClient,
  FindingModel,
  JobQueue,
  RecommendationModel,
  buildMockInventory,
  createLogger,
  createMetricsRegistry,
} from '@cloudops/shared';
import { JobProcessor } from '../src/processor';
import { loadWorkerConfig } from '../src/config';

describe('worker processor', () => {
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
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });

  it('persists findings from the diagnostics engine and completes the job', async () => {
    await CloudResourceModel.create(buildMockInventory('ws1').slice(0, 2));
    const job = await DiagnosticJobModel.create({
      workspaceId: 'ws1',
      status: 'pending',
      idempotencyKey: 'worker-job-1',
      correlationId: 'c-worker',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date(Date.now() - 10),
      createdBy: 'u1',
      timeoutMs: 5000,
    });

    const diagnostics = {
      analyze: jest.fn(async () => ({
        findings: [
          {
            resourceId: (await CloudResourceModel.findOne({
              name: 'i-web-prod-1',
            }))!._id.toString(),
            ruleId: 'ec2.low_utilization',
            severity: 'medium',
            title: 'Low CPU',
            description: 'cpu',
            evidence: { cpuUtilizationAvg: 3.2 },
            recommendation: {
              actionType: 'manual_review',
              explanation: 'rightsize',
              estimatedImpact: 'cost-save',
              confidence: 0.8,
            },
          },
        ],
      })),
    } as unknown as DiagnosticsClient;

    const processor = new JobProcessor(
      loadWorkerConfig({ WORKER_ID: 'w-test', WORKER_JOB_TIMEOUT_MS: '5000' }),
      new JobQueue({ leaseMs: 30_000, maxAttempts: 3, backoffBaseMs: 10, backoffMaxMs: 20 }),
      diagnostics,
      createLogger('worker-test', 'silent'),
      createMetricsRegistry('worker-test'),
    );

    await expect(processor.processNext()).resolves.toBe(true);
    const completed = await DiagnosticJobModel.findById(job._id);
    expect(completed?.status).toBe('completed');
    expect(await FindingModel.countDocuments()).toBe(1);
    expect(await RecommendationModel.countDocuments()).toBe(1);
  });

  it('times out and schedules a retry', async () => {
    const job = await DiagnosticJobModel.create({
      workspaceId: 'ws1',
      status: 'pending',
      idempotencyKey: 'worker-job-timeout',
      correlationId: 'c-timeout',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date(Date.now() - 10),
      createdBy: 'u1',
      timeoutMs: 30,
    });
    const diagnostics = {
      analyze: () => new Promise(() => undefined),
    } as unknown as DiagnosticsClient;
    const processor = new JobProcessor(
      loadWorkerConfig({ WORKER_ID: 'w-timeout' }),
      new JobQueue({ leaseMs: 30_000, maxAttempts: 3, backoffBaseMs: 10, backoffMaxMs: 20 }),
      diagnostics,
      createLogger('worker-test', 'silent'),
      createMetricsRegistry(`worker-timeout-${Date.now()}`),
    );
    await processor.processNext();
    const updated = await DiagnosticJobModel.findById(job._id);
    expect(updated?.status).toBe('retry_wait');
    expect(updated?.lastError?.code).toBe('TIMEOUT');
  });
});
