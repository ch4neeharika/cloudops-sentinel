import {
  ApprovalTokenModel,
  CloudResourceModel,
  ConflictError,
  FindingModel,
  ForbiddenError,
  NotFoundError,
  RecommendationModel,
  RemediationExecutionModel,
  RemediationPlanModel,
  applySimulatedAction,
  assertAllowlisted,
  generateApprovalToken,
  hashToken,
  recordAudit,
  rejectMutationsIfDisabled,
  serialize,
  tokensMatch,
  type AllowlistedAction,
} from '@cloudops/shared';
import type { ApiConfig } from '../config';

const ACTION_BY_RULE: Record<string, AllowlistedAction | 'manual_review'> = {
  'ec2.low_utilization': 'manual_review',
  'resource.missing_tags': 'add_missing_tag',
  's3.public_access': 'restrict_public_storage',
  'cloudwatch.missing_alarms': 'create_alarm',
  'service.unhealthy': 'restart_unhealthy_service',
  'resource.missing_backup': 'enable_backup_policy',
  'app.repeated_errors': 'restart_unhealthy_service',
  'api.elevated_latency': 'create_alarm',
  'reliability.failure_rate_increase': 'create_alarm',
};

export class RemediationService {
  constructor(private readonly config: ApiConfig) {}

  async createPlan(
    workspaceId: string,
    actorId: string,
    correlationId: string,
    input: { findingIds: string[]; dryRun: boolean; idempotencyKey: string },
  ) {
    const existing = await RemediationPlanModel.findOne({
      workspaceId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return { plan: serialize(existing), replayed: true };

    const findings = await FindingModel.find({
      workspaceId,
      _id: { $in: input.findingIds },
    });
    if (findings.length !== input.findingIds.length) {
      throw new NotFoundError('One or more findings were not found in this workspace');
    }
    const recs = await RecommendationModel.find({
      workspaceId,
      findingId: { $in: findings.map((f) => f._id.toString()) },
    });
    const recByFinding = new Map(recs.map((r) => [r.findingId, r]));
    const actions = findings
      .map((finding) => {
        const rec = recByFinding.get(finding._id.toString());
        const actionType = (rec?.actionType ??
          ACTION_BY_RULE[finding.ruleId] ??
          'manual_review') as string;
        if (actionType === 'manual_review') return null;
        assertAllowlisted(actionType);
        return {
          actionType,
          resourceId: finding.resourceId,
          findingId: finding._id.toString(),
          params: this.defaultParams(actionType, finding.resourceId),
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    const plan = await RemediationPlanModel.create({
      workspaceId,
      findingIds: input.findingIds,
      actions,
      dryRun: input.dryRun,
      status: 'awaiting_approval',
      createdBy: actorId,
      correlationId,
      idempotencyKey: input.idempotencyKey,
      version: 1,
    });
    await recordAudit({
      workspaceId,
      actorId,
      action: 'remediation.plan',
      resourceType: 'RemediationPlan',
      resourceId: plan._id.toString(),
      correlationId,
      metadata: { dryRun: input.dryRun, actions: actions.length },
    });
    return { plan: serialize(plan), replayed: false };
  }

  async approve(workspaceId: string, planId: string, actorId: string, correlationId: string) {
    const plan = await RemediationPlanModel.findOne({ _id: planId, workspaceId });
    if (!plan) throw new NotFoundError('Remediation plan not found');
    if (!['awaiting_approval', 'approved'].includes(plan.status)) {
      throw new ConflictError(`Plan cannot be approved from status ${plan.status}`);
    }
    const token = generateApprovalToken();
    const approval = await ApprovalTokenModel.create({
      workspaceId,
      planId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + this.config.APPROVAL_TTL_MS),
      createdBy: actorId,
    });
    plan.status = 'approved';
    await plan.save();
    await recordAudit({
      workspaceId,
      actorId,
      action: 'remediation.approve',
      resourceType: 'RemediationPlan',
      resourceId: planId,
      correlationId,
      metadata: { approvalTokenId: approval._id.toString() },
    });
    return {
      plan: serialize(plan),
      approvalToken: token,
      expiresAt: approval.expiresAt,
      approvalTokenId: approval._id.toString(),
    };
  }

  async execute(
    workspaceId: string,
    planId: string,
    actorId: string,
    correlationId: string,
    input: { approvalToken: string; idempotencyKey: string },
  ) {
    const existing = await RemediationExecutionModel.findOne({
      workspaceId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      return { execution: serialize(existing), replayed: true };
    }

    const plan = await RemediationPlanModel.findOne({ _id: planId, workspaceId });
    if (!plan) throw new NotFoundError('Remediation plan not found');
    if (plan.status !== 'approved') {
      throw new ConflictError('Plan must be approved before execution');
    }

    const approvals = await ApprovalTokenModel.find({ workspaceId, planId });
    const matched = approvals.find((a) => tokensMatch(input.approvalToken, a.tokenHash));
    if (!matched) throw new ForbiddenError('Invalid approval token');
    if (matched.usedAt) throw new ConflictError('Approval token already used');
    if (matched.expiresAt.getTime() < Date.now())
      throw new ForbiddenError('Approval token expired');

    if (!plan.dryRun) {
      rejectMutationsIfDisabled(this.config.ENABLE_AWS_MUTATIONS, this.config.CLOUD_PROVIDER);
    }

    const resourceIds = [...new Set(plan.actions.map((a) => a.resourceId))];
    const resources = await CloudResourceModel.find({ workspaceId, _id: { $in: resourceIds } });
    const byId = new Map(resources.map((r) => [r._id.toString(), r]));
    const beforeState: Record<string, unknown> = {};
    const afterState: Record<string, unknown> = {};
    const results = [];

    plan.status = 'executing';
    await plan.save();
    matched.usedAt = new Date();
    await matched.save();

    for (const action of plan.actions) {
      const resource = byId.get(action.resourceId);
      if (!resource) {
        results.push({
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: false,
          simulated: true,
          message: 'Resource not found in workspace',
        });
        continue;
      }
      beforeState[action.resourceId] = {
        tags: resource.tags,
        config: resource.config,
      };
      const applied = applySimulatedAction(
        {
          tags: resource.tags as Record<string, string>,
          config: resource.config,
          metrics: resource.metrics,
        },
        action,
      );
      results.push(applied.result);
      if (
        plan.dryRun ||
        this.config.CLOUD_PROVIDER === 'mock' ||
        !this.config.ENABLE_AWS_MUTATIONS
      ) {
        if (!plan.dryRun) {
          resource.tags = applied.resource.tags;
          resource.config = applied.resource.config;
          resource.metrics = applied.resource.metrics;
          resource.version += 1;
          await resource.save();
        }
      }
      afterState[action.resourceId] = plan.dryRun
        ? { preview: applied.resource }
        : { tags: resource.tags, config: resource.config };
    }

    const failed = results.filter((r) => !r.ok).length;
    const status =
      failed === 0 ? 'succeeded' : failed === results.length ? 'failed' : 'partial_failure';
    const execution = await RemediationExecutionModel.create({
      workspaceId,
      planId,
      approvalTokenId: matched._id.toString(),
      idempotencyKey: input.idempotencyKey,
      correlationId,
      status,
      dryRun: plan.dryRun,
      beforeState,
      afterState,
      results,
      startedAt: new Date(),
      completedAt: new Date(),
      createdBy: actorId,
    });
    plan.status = status === 'succeeded' ? 'completed' : 'failed';
    await plan.save();
    await recordAudit({
      workspaceId,
      actorId,
      action: 'remediation.execute',
      resourceType: 'RemediationExecution',
      resourceId: execution._id.toString(),
      correlationId,
      metadata: { status, dryRun: plan.dryRun, failed },
    });
    return { execution: serialize(execution), replayed: false };
  }

  private defaultParams(actionType: AllowlistedAction, resourceId: string): Record<string, string> {
    switch (actionType) {
      case 'add_missing_tag':
        return { key: 'Owner', value: 'platform' };
      case 'create_alarm':
        return { alarmName: `${resourceId}-health` };
      default:
        return {};
    }
  }
}
