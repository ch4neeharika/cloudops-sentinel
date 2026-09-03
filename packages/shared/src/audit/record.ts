import { AuditEventModel } from '../db/models';

export async function recordAudit(event: {
  workspaceId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}) {
  return AuditEventModel.create({
    workspaceId: event.workspaceId,
    actorId: event.actorId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    correlationId: event.correlationId,
    metadata: event.metadata ?? {},
    createdAt: new Date(),
  });
}
