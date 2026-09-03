import { Schema, model } from 'mongoose';
import { FINDING_SEVERITIES } from '../../constants';

const findingSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    jobId: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    ruleId: { type: String, required: true },
    severity: { type: String, enum: FINDING_SEVERITIES, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);

findingSchema.index({ workspaceId: 1, jobId: 1, resourceId: 1, ruleId: 1 }, { unique: true });

export const FindingModel = model('Finding', findingSchema);
