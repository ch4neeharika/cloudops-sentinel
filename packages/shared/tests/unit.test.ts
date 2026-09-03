import { exponentialBackoffWithJitter } from '../src/observability/retry';
import { CircuitBreaker } from '../src/observability/circuit-breaker';
import { applySimulatedAction, assertAllowlisted } from '../src/remediation/engine';
import { buildMockInventory } from '../src/providers/mock';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  canApprove,
} from '../src/auth';
import { createDiagnosticJobSchema, loginSchema } from '../src/schemas';
import { ForbiddenError } from '../src/errors';

describe('exponentialBackoffWithJitter', () => {
  it('grows with attempt and stays within cap', () => {
    const a1 = exponentialBackoffWithJitter({
      attempt: 1,
      baseMs: 100,
      maxMs: 1000,
      jitterRatio: 0,
    });
    const a4 = exponentialBackoffWithJitter({
      attempt: 4,
      baseMs: 100,
      maxMs: 1000,
      jitterRatio: 0,
    });
    expect(a1).toBe(100);
    expect(a4).toBe(800);
    const capped = exponentialBackoffWithJitter({
      attempt: 12,
      baseMs: 100,
      maxMs: 1000,
      jitterRatio: 0,
    });
    expect(capped).toBe(1000);
  });
});

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and rejects subsequent calls', async () => {
    const breaker = new CircuitBreaker(2, 10_000);
    await expect(
      breaker.exec(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    await expect(
      breaker.exec(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    await expect(breaker.exec(async () => 'ok')).rejects.toThrow('circuit breaker is open');
    expect(breaker.getState()).toBe('open');
  });
});

describe('validation schemas', () => {
  it('rejects short idempotency keys', () => {
    const parsed = createDiagnosticJobSchema.safeParse({ idempotencyKey: 'short' });
    expect(parsed.success).toBe(false);
  });

  it('accepts a well-formed login payload', () => {
    const parsed = loginSchema.parse({ email: 'admin@cloudops.local', password: 'CloudOps!demo' });
    expect(parsed.email).toContain('@');
  });
});

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('CloudOps!demo', 4);
    await expect(verifyPassword('CloudOps!demo', hash)).resolves.toBe(true);
    await expect(verifyPassword('nope', hash)).resolves.toBe(false);
  });

  it('signs and verifies JWT claims', () => {
    const token = signAccessToken(
      { sub: 'u1', email: 'a@x.com', role: 'admin', workspaceId: 'ws1' },
      'secret',
      '1h',
    );
    const claims = verifyAccessToken(token, 'secret');
    expect(claims.role).toBe('admin');
    expect(canApprove(claims.role)).toBe(true);
  });
});

describe('mock inventory', () => {
  it('includes resources that trigger every policy family', () => {
    const items = buildMockInventory('ws1');
    expect(items.some((r) => (r.metrics.cpuUtilizationAvg ?? 99) < 10)).toBe(true);
    expect(items.some((r) => Object.keys(r.tags).length === 0)).toBe(true);
    expect(items.some((r) => r.config.publicAccess === true)).toBe(true);
    expect(items.some((r) => (r.config.alarms ?? []).length === 0 && r.type !== 's3')).toBe(true);
    expect(items.some((r) => r.config.healthCheckStatus === 'unhealthy')).toBe(true);
    expect(items.some((r) => r.config.backupEnabled === false && r.type === 'ec2')).toBe(true);
    expect(items.some((r) => (r.metrics.errorRate ?? 0) > 0.05)).toBe(true);
    expect(items.some((r) => (r.metrics.p99LatencyMs ?? 0) > 1000)).toBe(true);
    expect(items.some((r) => (r.metrics.failureRateDelta ?? 0) > 0.1)).toBe(true);
  });
});

describe('simulated remediation', () => {
  it('rejects non-allowlisted actions', () => {
    expect(() => assertAllowlisted('delete_account')).toThrow(ForbiddenError);
  });

  it('adds a missing tag', () => {
    const { resource, result } = applySimulatedAction(
      { tags: {}, config: { alarms: [] }, metrics: {} },
      {
        actionType: 'add_missing_tag',
        resourceId: 'r1',
        findingId: 'f1',
        params: { key: 'Owner', value: 'sre' },
      },
    );
    expect(resource.tags.Owner).toBe('sre');
    expect(result.ok).toBe(true);
  });
});
