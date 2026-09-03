import { REQUIRED_TAGS } from '../constants';
import type { CloudResource } from '../types';
import type { CloudProvider, InventoryQuery } from './types';

const NOW = () => new Date();

function resource(
  partial: Omit<
    CloudResource,
    'id' | 'createdAt' | 'updatedAt' | 'lastSyncedAt' | 'version' | 'provider'
  > & {
    lastSyncedAt?: Date;
  },
): Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    provider: 'mock',
    version: 1,
    lastSyncedAt: NOW(),
    ...partial,
  };
}

/**
 * Deterministic seeded inventory used for local demos and tests.
 * Each resource is intentionally constructed to trigger specific policy rules.
 */
export function buildMockInventory(
  workspaceId: string,
): Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    resource({
      workspaceId,
      type: 'ec2',
      region: 'us-east-1',
      arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-web-prod-1',
      name: 'i-web-prod-1',
      tags: { Environment: 'prod', Owner: 'platform', Service: 'web' },
      config: {
        publicAccess: false,
        backupEnabled: false,
        alarms: ['cpu-high'],
        healthCheckStatus: 'healthy',
        instanceState: 'running',
      },
      metrics: {
        cpuUtilizationAvg: 3.2,
        consecutiveLowUtilizationPeriods: 6,
        errorRate: 0.01,
        errorCount: 4,
        p99LatencyMs: 180,
        failureRateDelta: 0.0,
        requestCount: 12000,
      },
    }),
    resource({
      workspaceId,
      type: 'ec2',
      region: 'us-east-1',
      arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-api-prod-2',
      name: 'i-api-prod-2',
      tags: { Environment: 'prod', Owner: 'api', CostCenter: 'cc-100', Service: 'checkout-api' },
      config: {
        publicAccess: false,
        backupEnabled: true,
        alarms: ['5xx'],
        healthCheckStatus: 'unhealthy',
        instanceState: 'running',
      },
      metrics: {
        cpuUtilizationAvg: 62,
        consecutiveLowUtilizationPeriods: 0,
        errorRate: 0.14,
        errorCount: 88,
        p99LatencyMs: 2400,
        failureRateDelta: 0.18,
        requestCount: 54000,
      },
    }),
    resource({
      workspaceId,
      type: 'ec2',
      region: 'us-west-2',
      arn: 'arn:aws:ec2:us-west-2:123456789012:instance/i-batch-dev-3',
      name: 'i-batch-dev-3',
      tags: {},
      config: {
        publicAccess: false,
        backupEnabled: false,
        alarms: [],
        healthCheckStatus: 'unknown',
        instanceState: 'running',
      },
      metrics: {
        cpuUtilizationAvg: 18,
        consecutiveLowUtilizationPeriods: 1,
        errorRate: 0.0,
        errorCount: 0,
        p99LatencyMs: 90,
        failureRateDelta: 0,
        requestCount: 200,
      },
    }),
    resource({
      workspaceId,
      type: 'ec2',
      region: 'us-east-1',
      arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-db-prod',
      name: 'i-db-prod',
      tags: { Environment: 'prod', Owner: 'data', CostCenter: 'cc-200', Service: 'postgres' },
      config: {
        publicAccess: false,
        backupEnabled: false,
        alarms: ['disk'],
        healthCheckStatus: 'healthy',
        instanceState: 'running',
      },
      metrics: {
        cpuUtilizationAvg: 41,
        consecutiveLowUtilizationPeriods: 0,
        errorRate: 0.002,
        errorCount: 2,
        p99LatencyMs: 40,
        failureRateDelta: 0,
        requestCount: 8000,
      },
    }),
    resource({
      workspaceId,
      type: 'ec2',
      region: 'us-east-1',
      arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-cache-prod',
      name: 'i-cache-prod',
      tags: { Environment: 'prod', Owner: 'platform', CostCenter: 'cc-100', Service: 'redis' },
      config: {
        publicAccess: false,
        backupEnabled: true,
        alarms: [],
        healthCheckStatus: 'healthy',
        instanceState: 'running',
      },
      metrics: {
        cpuUtilizationAvg: 33,
        consecutiveLowUtilizationPeriods: 0,
        errorRate: 0.0,
        errorCount: 0,
        p99LatencyMs: 12,
        failureRateDelta: 0,
        requestCount: 90000,
      },
    }),
    resource({
      workspaceId,
      type: 's3',
      region: 'us-east-1',
      arn: 'arn:aws:s3:::acme-public-assets',
      name: 'acme-public-assets',
      tags: { Environment: 'prod', Service: 'cdn' },
      config: { publicAccess: true, backupEnabled: false, alarms: [], encryption: false },
      metrics: { requestCount: 400000 },
    }),
    resource({
      workspaceId,
      type: 's3',
      region: 'us-east-1',
      arn: 'arn:aws:s3:::acme-logs-private',
      name: 'acme-logs-private',
      tags: Object.fromEntries(
        REQUIRED_TAGS.map((t) => [t, t === 'CostCenter' ? 'cc-100' : 'ops']),
      ),
      config: {
        publicAccess: false,
        backupEnabled: true,
        alarms: ['replication-lag'],
        encryption: true,
      },
      metrics: { requestCount: 1200 },
    }),
    resource({
      workspaceId,
      type: 's3',
      region: 'us-west-2',
      arn: 'arn:aws:s3:::acme-data-lake',
      name: 'acme-data-lake',
      tags: { Environment: 'prod', Owner: 'analytics', CostCenter: 'cc-300', Service: 'lake' },
      config: { publicAccess: true, backupEnabled: true, alarms: [], encryption: true },
      metrics: { requestCount: 22000 },
    }),
    resource({
      workspaceId,
      type: 's3',
      region: 'us-east-1',
      arn: 'arn:aws:s3:::acme-backups',
      name: 'acme-backups',
      tags: { Environment: 'prod', Owner: 'sre', CostCenter: 'cc-100', Service: 'backup' },
      config: {
        publicAccess: false,
        backupEnabled: true,
        alarms: ['failed-jobs'],
        encryption: true,
      },
      metrics: { requestCount: 80 },
    }),
    resource({
      workspaceId,
      type: 'lambda',
      region: 'us-east-1',
      arn: 'arn:aws:lambda:us-east-1:123456789012:function:ingest',
      name: 'ingest',
      tags: { Environment: 'prod', Owner: 'data', Service: 'ingest' },
      config: {
        backupEnabled: false,
        alarms: [],
        runtime: 'nodejs20.x',
        healthCheckStatus: 'healthy',
      },
      metrics: {
        errorRate: 0.09,
        errorCount: 41,
        p99LatencyMs: 1800,
        failureRateDelta: 0.04,
        requestCount: 15000,
      },
    }),
    resource({
      workspaceId,
      type: 'lambda',
      region: 'us-east-1',
      arn: 'arn:aws:lambda:us-east-1:123456789012:function:reports',
      name: 'reports',
      tags: { Environment: 'prod', Owner: 'bi', CostCenter: 'cc-300', Service: 'reports' },
      config: {
        backupEnabled: false,
        alarms: ['errors', 'throttles'],
        runtime: 'python3.12',
        healthCheckStatus: 'healthy',
      },
      metrics: {
        errorRate: 0.004,
        errorCount: 3,
        p99LatencyMs: 420,
        failureRateDelta: 0,
        requestCount: 4000,
      },
    }),
    resource({
      workspaceId,
      type: 'lambda',
      region: 'us-east-1',
      arn: 'arn:aws:lambda:us-east-1:123456789012:function:webhooks',
      name: 'webhooks',
      tags: { Environment: 'prod', Owner: 'api', CostCenter: 'cc-100', Service: 'webhooks' },
      config: {
        backupEnabled: false,
        alarms: ['duration'],
        runtime: 'nodejs20.x',
        healthCheckStatus: 'healthy',
      },
      metrics: {
        errorRate: 0.03,
        errorCount: 19,
        p99LatencyMs: 700,
        failureRateDelta: 0.22,
        requestCount: 9000,
      },
    }),
    resource({
      workspaceId,
      type: 'cloudwatch',
      region: 'us-east-1',
      arn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:cpu-high',
      name: 'cpu-high',
      tags: { Environment: 'prod', Owner: 'sre', CostCenter: 'cc-100', Service: 'observability' },
      config: { alarms: ['cpu-high'] },
      metrics: {},
    }),
  ];
}

export class MockAwsProvider implements CloudProvider {
  readonly name = 'mock' as const;
  readonly readOnly = true;

  constructor(private readonly workspaceId: string) {}

  async listResources(
    query?: InventoryQuery,
  ): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    let items = buildMockInventory(this.workspaceId);
    if (query?.types?.length) {
      items = items.filter((r) => query.types!.includes(r.type));
    }
    if (query?.region) {
      items = items.filter((r) => r.region === query.region);
    }
    return items;
  }
}
