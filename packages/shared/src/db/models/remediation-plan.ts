import { Schema, model } from 'mongoose';
import { PLAN_STATUSES } from '../../constants';

const remediationPlanSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    findingIds: { type: [String], required: true },
    actions: { type: [Schema.Types.Mixed], required: true },
    dryRun: { type: Boolean, default: true },
    status: { type: String, enum: PLAN_STATUSES, required: true, index: true },
    createdBy: { type: String, required: true },
    correlationId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

remediationPlanSchema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true });

export const RemediationPlanModel = model('RemediationPlan', remediationPlanSchema);
