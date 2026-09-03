import {
  FindingModel,
  RecommendationModel,
  AuditEventModel,
  HealthCheckModel,
  serialize,
} from '@cloudops/shared';

export async function listFindings(
  workspaceId: string,
  query: { page: number; limit: number; severity?: string; resourceId?: string; jobId?: string },
) {
  const filter: Record<string, unknown> = { workspaceId };
  if (query.severity) filter.severity = query.severity;
  if (query.resourceId) filter.resourceId = query.resourceId;
  if (query.jobId) filter.jobId = query.jobId;
  const total = await FindingModel.countDocuments(filter);
  const docs = await FindingModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit);
  return { items: docs.map(serialize), page: query.page, limit: query.limit, total };
}

export async function listRecommendations(
  workspaceId: string,
  query: { page: number; limit: number; actionType?: string; jobId?: string },
) {
  const filter: Record<string, unknown> = { workspaceId };
  if (query.actionType) filter.actionType = query.actionType;
  if (query.jobId) filter.jobId = query.jobId;
  const total = await RecommendationModel.countDocuments(filter);
  const docs = await RecommendationModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit);
  return { items: docs.map(serialize), page: query.page, limit: query.limit, total };
}

export async function listAuditEvents(
  workspaceId: string,
  query: { page: number; limit: number; action?: string; actorId?: string },
) {
  const filter: Record<string, unknown> = { workspaceId };
  if (query.action) filter.action = query.action;
  if (query.actorId) filter.actorId = query.actorId;
  const total = await AuditEventModel.countDocuments(filter);
  const docs = await AuditEventModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit);
  return { items: docs.map(serialize), page: query.page, limit: query.limit, total };
}

export async function listHealthChecks(workspaceId: string, resourceId?: string) {
  const filter: Record<string, unknown> = { workspaceId };
  if (resourceId) filter.resourceId = resourceId;
  const docs = await HealthCheckModel.find(filter).sort({ observedAt: -1 }).limit(50);
  return docs.map(serialize);
}
