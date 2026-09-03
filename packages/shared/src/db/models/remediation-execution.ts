import { Schema, model } from 'mongoose';
import { EXECUTION_STATUSES } from '../../constants';

const remediationExecutionSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    planId: { type: String, required: true, index: true },
    approvalTokenId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    correlationId: { type: String, required: true },
    status: { type: String, enum: EXECUTION_STATUSES, required: true },
    dryRun: { type: Boolean, required: true },
    beforeState: { type: Schema.Types.Mixed, default: {} },
    afterState: { type: Schema.Types.Mixed, default: {} },
    results: { type: [Schema.Types.Mixed], default: [] },
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

remediationExecutionSchema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true });

export const RemediationExecutionModel = model('RemediationExecution', remediationExecutionSchema);
