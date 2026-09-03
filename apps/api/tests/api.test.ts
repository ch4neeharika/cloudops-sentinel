import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import {
  UserModel,
  WorkspaceModel,
  CloudResourceModel,
  FindingModel,
  RecommendationModel,
  DiagnosticJobModel,
  hashPassword,
  signAccessToken,
  buildMockInventory,
} from '@cloudops/shared';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

const JWT_SECRET = 'test-secret-at-least-16';

async function token(role: 'admin' | 'operator' | 'viewer', workspaceId = 'ws_demo_acme') {
  const user = await UserModel.findOne({ email: `${role}@cloudops.local`, workspaceId });
  return signAccessToken(
    { sub: user!._id.toString(), email: user!.email, role, workspaceId },
    JWT_SECRET,
    '1h',
  );
}

describe('CloudOps Sentinel API', () => {
  let mongo: MongoMemoryServer;
  let app: ReturnType<typeof createApp>['app'];

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.MONGODB_URI = mongo.getUri();
    await mongoose.connect(mongo.getUri());
    const config = loadConfig({
      JWT_SECRET,
      MONGODB_URI: mongo.getUri(),
      LOG_LEVEL: 'silent',
      CLOUD_PROVIDER: 'mock',
      ENABLE_AWS_MUTATIONS: 'false',
    });
    app = createApp(config).app;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    await WorkspaceModel.create({ _id: new mongoose.Types.ObjectId(), name: 'acme' });
    const passwordHash = await hashPassword('CloudOps!demo', 4);
    await UserModel.create([
      {
        workspaceId: 'ws_demo_acme',
        email: 'admin@cloudops.local',
        role: 'admin',
        passwordHash,
        active: true,
      },
      {
        workspaceId: 'ws_demo_acme',
        email: 'operator@cloudops.local',
        role: 'operator',
        passwordHash,
        active: true,
      },
      {
        workspaceId: 'ws_demo_acme',
        email: 'viewer@cloudops.local',
        role: 'viewer',
        passwordHash,
        active: true,
      },
      {
        workspaceId: 'ws_other',
        email: 'admin@other.local',
        role: 'admin',
        passwordHash,
        active: true,
      },
    ]);
  });

  it('exposes liveness and metrics', async () => {
    await request(app).get('/health/live').expect(200);
    const metrics = await request(app).get('/metrics').expect(200);
    expect(metrics.text).toContain('http_requests_total');
  });

  it('authenticates with email/password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@cloudops.local', password: 'CloudOps!demo' })
      .expect(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects invalid credentials without leaking details', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@cloudops.local', password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('syncs mock inventory and lists resources', async () => {
    const admin = await token('admin');
    await request(app)
      .post('/api/v1/resources/sync')
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(202);
    const list = await request(app)
      .get('/api/v1/resources')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(list.body.total).toBeGreaterThan(5);
  });

  it('blocks viewers from creating diagnostic jobs', async () => {
    const viewer = await token('viewer');
    await request(app)
      .post('/api/v1/diagnostics')
      .set('Authorization', `Bearer ${viewer}`)
      .send({ idempotencyKey: 'idem-12345678' })
      .expect(403);
  });

  it('replays diagnostic jobs with the same idempotency key', async () => {
    const operator = await token('operator');
    const first = await request(app)
      .post('/api/v1/diagnostics')
      .set('Authorization', `Bearer ${operator}`)
      .send({ idempotencyKey: 'idem-diag-0001' })
      .expect(202);
    const second = await request(app)
      .post('/api/v1/diagnostics')
      .set('Authorization', `Bearer ${operator}`)
      .send({ idempotencyKey: 'idem-diag-0001' })
      .expect(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.job.id).toBe(first.body.job.id);
  });

  it('enforces workspace isolation for resources', async () => {
    const admin = await token('admin');
    await request(app)
      .post('/api/v1/resources/sync')
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(202);
    const other = signAccessToken(
      {
        sub: (await UserModel.findOne({ email: 'admin@other.local' }))!._id.toString(),
        email: 'admin@other.local',
        role: 'admin',
        workspaceId: 'ws_other',
      },
      JWT_SECRET,
      '1h',
    );
    const list = await request(app)
      .get('/api/v1/resources')
      .set('Authorization', `Bearer ${other}`)
      .expect(200);
    expect(list.body.total).toBe(0);
  });

  it('requires admin approval and a valid token to execute remediations', async () => {
    const admin = await token('admin');
    const operator = await token('operator');
    await CloudResourceModel.create({
      ...buildMockInventory('ws_demo_acme')[5],
      workspaceId: 'ws_demo_acme',
    });
    const resource = await CloudResourceModel.findOne({ name: 'acme-public-assets' });
    const job = await DiagnosticJobModel.create({
      workspaceId: 'ws_demo_acme',
      status: 'completed',
      idempotencyKey: 'job-1-keyxx',
      correlationId: 'c1',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: new Date(),
      createdBy: 'op',
      timeoutMs: 5000,
    });
    const finding = await FindingModel.create({
      workspaceId: 'ws_demo_acme',
      jobId: job._id.toString(),
      resourceId: resource!._id.toString(),
      ruleId: 's3.public_access',
      severity: 'high',
      title: 'Public bucket',
      description: 'public',
      evidence: { publicAccess: true },
      correlationId: 'c1',
    });
    await RecommendationModel.create({
      workspaceId: 'ws_demo_acme',
      jobId: job._id.toString(),
      findingId: finding._id.toString(),
      resourceId: resource!._id.toString(),
      actionType: 'restrict_public_storage',
      explanation: 'Block public ACLs',
      estimatedImpact: 'low',
      confidence: 0.9,
      correlationId: 'c1',
    });

    await request(app)
      .post('/api/v1/remediations/plan')
      .set('Authorization', `Bearer ${operator}`)
      .send({ findingIds: [finding._id.toString()], dryRun: true, idempotencyKey: 'plan-key-001' })
      .expect(201);

    const planListBlocked = await request(app)
      .post('/api/v1/remediations/plan')
      .set('Authorization', `Bearer ${await token('viewer')}`)
      .send({ findingIds: [finding._id.toString()], dryRun: true, idempotencyKey: 'plan-key-002' })
      .expect(403);
    expect(planListBlocked.status).toBe(403);

    const created = await request(app)
      .post('/api/v1/remediations/plan')
      .set('Authorization', `Bearer ${operator}`)
      .send({ findingIds: [finding._id.toString()], dryRun: true, idempotencyKey: 'plan-key-001' })
      .expect(200);
    const planId = created.body.plan.id;

    await request(app)
      .post(`/api/v1/remediations/${planId}/approve`)
      .set('Authorization', `Bearer ${operator}`)
      .expect(403);

    const approved = await request(app)
      .post(`/api/v1/remediations/${planId}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(approved.body.approvalToken).toHaveLength(64);

    await request(app)
      .post(`/api/v1/remediations/${planId}/execute`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ approvalToken: 'totally-invalid-token-xx', idempotencyKey: 'exec-1-xxxxx' })
      .expect(403);

    const executed = await request(app)
      .post(`/api/v1/remediations/${planId}/execute`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ approvalToken: approved.body.approvalToken, idempotencyKey: 'exec-1-xxxxx' })
      .expect(200);
    expect(executed.body.execution.status).toBe('succeeded');
    expect(executed.body.execution.dryRun).toBe(true);

    const replay = await request(app)
      .post(`/api/v1/remediations/${planId}/execute`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ approvalToken: approved.body.approvalToken, idempotencyKey: 'exec-1-xxxxx' })
      .expect(200);
    expect(replay.body.replayed).toBe(true);
  });

  it('rejects expired approval tokens', async () => {
    const admin = await token('admin');
    await CloudResourceModel.create({
      ...buildMockInventory('ws_demo_acme')[0],
      workspaceId: 'ws_demo_acme',
    });
    const resource = await CloudResourceModel.findOne({ name: 'i-web-prod-1' });
    const finding = await FindingModel.create({
      workspaceId: 'ws_demo_acme',
      jobId: new mongoose.Types.ObjectId().toString(),
      resourceId: resource!._id.toString(),
      ruleId: 'resource.missing_tags',
      severity: 'medium',
      title: 'Missing tags',
      description: 'tags',
      evidence: {},
      correlationId: 'c2',
    });
    await RecommendationModel.create({
      workspaceId: 'ws_demo_acme',
      jobId: finding.jobId,
      findingId: finding._id.toString(),
      resourceId: resource!._id.toString(),
      actionType: 'add_missing_tag',
      explanation: 'Add Owner',
      estimatedImpact: 'none',
      confidence: 0.95,
      correlationId: 'c2',
    });
    const plan = await request(app)
      .post('/api/v1/remediations/plan')
      .set('Authorization', `Bearer ${admin}`)
      .send({ findingIds: [finding._id.toString()], dryRun: true, idempotencyKey: 'plan-exp-01' })
      .expect(201);

    const { RemediationService } = await import('../src/services/remediation-service');
    const svc = new RemediationService(
      loadConfig({ JWT_SECRET, APPROVAL_TTL_MS: '1', MONGODB_URI: mongo.getUri() }),
    );
    const approval = await svc.approve('ws_demo_acme', plan.body.plan.id, 'admin', 'c2');
    await new Promise((r) => setTimeout(r, 5));
    await expect(
      svc.execute('ws_demo_acme', plan.body.plan.id, 'admin', 'c2', {
        approvalToken: approval.approvalToken,
        idempotencyKey: 'exec-exp-01',
      }),
    ).rejects.toThrow('expired');
  });

  it('returns correlation IDs on validation errors', async () => {
    const admin = await token('admin');
    const res = await request(app)
      .post('/api/v1/diagnostics')
      .set('Authorization', `Bearer ${admin}`)
      .set('x-correlation-id', 'corr-fixed-1')
      .send({ idempotencyKey: 'x' })
      .expect(400);
    expect(res.body.error.correlationId).toBe('corr-fixed-1');
    expect(res.headers['x-correlation-id']).toBe('corr-fixed-1');
  });
});
