import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  GetMetricStatisticsCommand,
  ListMetricsCommand,
  CloudWatchClient,
} from '@aws-sdk/client-cloudwatch';
import {
  GetFunctionCommand,
  ListFunctionsCommand,
  LambdaClient,
  ListTagsCommand,
} from '@aws-sdk/client-lambda';
import {
  GetBucketLocationCommand,
  GetBucketTaggingCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { CloudResource, ResourceType } from '../types';
import { withTimeout } from '../observability/retry';
import type { CloudProvider, InventoryQuery } from './types';
import { ProviderError } from './types';

export interface AwsProviderOptions {
  region: string;
  workspaceId: string;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  endpoint?: string;
  readOnly?: boolean;
}

function isThrottle(err: unknown): boolean {
  const name = (err as { name?: string }).name ?? '';
  return ['Throttling', 'ThrottlingException', 'TooManyRequestsException', 'TimeoutError'].includes(
    name,
  );
}

function wrap(err: unknown, action: string): ProviderError {
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError(`AWS ${action} failed: ${message}`, {
    retryable: isThrottle(err),
    code: isThrottle(err) ? 'THROTTLED' : 'AWS_ERROR',
  });
}

/**
 * Read-only AWS inventory collector. Mutations are never issued from this class.
 * Credentials come exclusively from the standard AWS SDK default provider chain.
 */
export class AwsProvider implements CloudProvider {
  readonly name = 'aws' as const;
  readonly readOnly: boolean;
  private readonly region: string;
  private readonly workspaceId: string;
  private readonly timeoutMs: number;
  private readonly ec2: EC2Client;
  private readonly s3: S3Client;
  private readonly lambda: LambdaClient;
  private readonly cw: CloudWatchClient;

  constructor(opts: AwsProviderOptions) {
    this.region = opts.region;
    this.workspaceId = opts.workspaceId;
    this.timeoutMs = opts.requestTimeoutMs ?? 4000;
    this.readOnly = opts.readOnly ?? true;
    const clientConfig = {
      region: opts.region,
      maxAttempts: opts.maxAttempts ?? 3,
      ...(opts.endpoint ? { endpoint: opts.endpoint, forcePathStyle: true } : {}),
    };
    this.ec2 = new EC2Client(clientConfig);
    this.s3 = new S3Client(clientConfig);
    this.lambda = new LambdaClient(clientConfig);
    this.cw = new CloudWatchClient(clientConfig);
  }

  async listResources(
    query?: InventoryQuery,
  ): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const types = query?.types ?? (['ec2', 's3', 'lambda', 'cloudwatch'] as ResourceType[]);
    const collected: Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    try {
      if (types.includes('ec2')) collected.push(...(await this.listEc2()));
      if (types.includes('s3')) collected.push(...(await this.listS3()));
      if (types.includes('lambda')) collected.push(...(await this.listLambda()));
      if (types.includes('cloudwatch')) collected.push(...(await this.listAlarms()));
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw wrap(err, 'ListResources');
    }
    return collected;
  }

  private async send<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(
        fn(),
        this.timeoutMs,
        `AWS ${label} timed out after ${this.timeoutMs}ms`,
      );
    } catch (err) {
      throw wrap(err, label);
    }
  }

  private async listEc2(): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const out = await this.send('DescribeInstances', () =>
      this.ec2.send(new DescribeInstancesCommand({ MaxResults: 50 })),
    );
    const resources: Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    for (const reservation of out.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        const id = instance.InstanceId ?? 'unknown';
        const tags = Object.fromEntries(
          (instance.Tags ?? []).map((t) => [t.Key ?? '', t.Value ?? '']),
        );
        resources.push({
          workspaceId: this.workspaceId,
          provider: 'aws',
          type: 'ec2',
          region: this.region,
          arn: `arn:aws:ec2:${this.region}:instance/${id}`,
          name: tags.Name ?? id,
          tags,
          config: {
            publicAccess: (instance.PublicIpAddress ?? '').length > 0,
            backupEnabled: false,
            alarms: [],
            healthCheckStatus: instance.State?.Name === 'running' ? 'healthy' : 'unknown',
            instanceState: instance.State?.Name,
          },
          metrics: await this.cpuForInstance(id),
          lastSyncedAt: new Date(),
          version: 1,
          raw: { instanceType: instance.InstanceType, launchTime: instance.LaunchTime },
        });
      }
    }
    return resources;
  }

  private async cpuForInstance(instanceId: string): Promise<{ cpuUtilizationAvg: number }> {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 60 * 60 * 1000);
      const stats = await this.send('GetMetricStatistics', () =>
        this.cw.send(
          new GetMetricStatisticsCommand({
            Namespace: 'AWS/EC2',
            MetricName: 'CPUUtilization',
            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
            StartTime: start,
            EndTime: end,
            Period: 300,
            Statistics: ['Average'],
          }),
        ),
      );
      const points = stats.Datapoints ?? [];
      const avg =
        points.length === 0
          ? 0
          : points.reduce((sum, p) => sum + (p.Average ?? 0), 0) / points.length;
      return { cpuUtilizationAvg: Number(avg.toFixed(2)) };
    } catch {
      return { cpuUtilizationAvg: 0 };
    }
  }

  private async listS3(): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const listed = await this.send('ListBuckets', () => this.s3.send(new ListBucketsCommand({})));
    const resources: Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    for (const bucket of listed.Buckets ?? []) {
      const name = bucket.Name ?? 'unknown';
      let region = this.region;
      try {
        const loc = await this.send('GetBucketLocation', () =>
          this.s3.send(new GetBucketLocationCommand({ Bucket: name })),
        );
        region = loc.LocationConstraint || 'us-east-1';
      } catch {
        /* location is optional for inventory */
      }
      let tags: Record<string, string> = {};
      try {
        const tagging = await this.send('GetBucketTagging', () =>
          this.s3.send(new GetBucketTaggingCommand({ Bucket: name })),
        );
        tags = Object.fromEntries((tagging.TagSet ?? []).map((t) => [t.Key ?? '', t.Value ?? '']));
      } catch {
        tags = {};
      }
      let publicAccess = false;
      try {
        const pab = await this.send('GetPublicAccessBlock', () =>
          this.s3.send(new GetPublicAccessBlockCommand({ Bucket: name })),
        );
        const cfg = pab.PublicAccessBlockConfiguration;
        publicAccess = !(
          cfg?.BlockPublicAcls &&
          cfg.BlockPublicPolicy &&
          cfg.IgnorePublicAcls &&
          cfg.RestrictPublicBuckets
        );
      } catch {
        publicAccess = true;
      }
      resources.push({
        workspaceId: this.workspaceId,
        provider: 'aws',
        type: 's3',
        region,
        arn: `arn:aws:s3:::${name}`,
        name,
        tags,
        config: { publicAccess, backupEnabled: false, alarms: [] },
        metrics: {},
        lastSyncedAt: new Date(),
        version: 1,
      });
    }
    return resources;
  }

  private async listLambda(): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const listed = await this.send('ListFunctions', () =>
      this.lambda.send(new ListFunctionsCommand({ MaxItems: 50 })),
    );
    const resources: Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    for (const fn of listed.Functions ?? []) {
      const name = fn.FunctionName ?? 'unknown';
      let tags: Record<string, string> = {};
      if (fn.FunctionArn) {
        try {
          const tagged = await this.send('ListTags', () =>
            this.lambda.send(new ListTagsCommand({ Resource: fn.FunctionArn })),
          );
          tags = tagged.Tags ?? {};
        } catch {
          tags = {};
        }
      }
      try {
        await this.send('GetFunction', () =>
          this.lambda.send(new GetFunctionCommand({ FunctionName: name })),
        );
      } catch {
        /* GetFunction is used for completeness; listing is sufficient */
      }
      resources.push({
        workspaceId: this.workspaceId,
        provider: 'aws',
        type: 'lambda',
        region: this.region,
        arn: fn.FunctionArn ?? name,
        name,
        tags,
        config: {
          alarms: [],
          runtime: fn.Runtime,
          backupEnabled: false,
          healthCheckStatus: 'unknown',
        },
        metrics: {},
        lastSyncedAt: new Date(),
        version: 1,
      });
    }
    return resources;
  }

  private async listAlarms(): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const metrics = await this.send('ListMetrics', () =>
      this.cw.send(new ListMetricsCommand({ Namespace: 'AWS/EC2', MetricName: 'CPUUtilization' })),
    );
    return (metrics.Metrics ?? []).slice(0, 20).map((m, idx) => ({
      workspaceId: this.workspaceId,
      provider: 'aws' as const,
      type: 'cloudwatch' as const,
      region: this.region,
      arn: `arn:aws:cloudwatch:${this.region}:metric/${m.MetricName ?? 'metric'}-${idx}`,
      name: m.MetricName ?? `metric-${idx}`,
      tags: {},
      config: { alarms: [m.MetricName ?? 'metric'] },
      metrics: {},
      lastSyncedAt: new Date(),
      version: 1,
    }));
  }
}
