import {
  CloudResourceModel,
  createCloudProvider,
  recordAudit,
  serialize,
  type CloudProvider,
} from '@cloudops/shared';
import type { ApiConfig } from '../config';

export class ResourceService {
  constructor(private readonly config: ApiConfig) {}

  private providerFor(workspaceId: string): CloudProvider {
    return createCloudProvider({
      mode: this.config.CLOUD_PROVIDER,
      workspaceId,
      region: this.config.AWS_REGION,
      readOnly: this.config.AWS_READ_ONLY,
      maxAttempts: this.config.AWS_MAX_ATTEMPTS,
      requestTimeoutMs: this.config.AWS_REQUEST_TIMEOUT_MS,
      endpoint: this.config.AWS_ENDPOINT_URL || undefined,
    });
  }

  async sync(
    workspaceId: string,
    actorId: string,
    correlationId: string,
    query: { types?: Array<'ec2' | 's3' | 'lambda' | 'cloudwatch'>; region?: string },
  ) {
    const provider = this.providerFor(workspaceId);
    const discovered = await provider.listResources(query);
    const upserted = [];
    for (const item of discovered) {
      const { version: _ignoredVersion, ...fields } = item;
      const doc = await CloudResourceModel.findOneAndUpdate(
        { workspaceId, arn: item.arn },
        { $set: { ...fields, lastSyncedAt: new Date() }, $inc: { version: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      upserted.push(serialize(doc));
    }
    await recordAudit({
      workspaceId,
      actorId,
      action: 'resources.sync',
      resourceType: 'CloudResource',
      correlationId,
      metadata: { count: upserted.length, provider: provider.name },
    });
    return { synced: upserted.length, provider: provider.name, items: upserted };
  }

  async list(
    workspaceId: string,
    query: { page: number; limit: number; type?: string; region?: string; q?: string },
  ) {
    const filter: Record<string, unknown> = { workspaceId };
    if (query.type) filter.type = query.type;
    if (query.region) filter.region = query.region;
    if (query.q)
      filter.name = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const total = await CloudResourceModel.countDocuments(filter);
    const docs = await CloudResourceModel.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit);
    return { items: docs.map(serialize), page: query.page, limit: query.limit, total };
  }

  async get(workspaceId: string, id: string) {
    const doc = await CloudResourceModel.findOne({ _id: id, workspaceId });
    return doc ? serialize(doc) : null;
  }
}
