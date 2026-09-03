import { Schema, model } from 'mongoose';
import { JOB_STATUSES } from '../../constants';

const diagnosticJobSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    status: { type: String, enum: JOB_STATUSES, required: true, index: true },
    resourceIds: { type: [String], default: undefined },
    resourceTypes: { type: [String], default: undefined },
    idempotencyKey: { type: String, required: true },
    correlationId: { type: String, required: true, index: true },
    leaseUntil: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
    claimedBy: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    nextRunAt: { type: Date, required: true, index: true },
    lastError: { type: Schema.Types.Mixed, default: null },
    resultSummary: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, required: true },
    completedAt: { type: Date, default: null },
    timeoutMs: { type: Number, required: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

diagnosticJobSchema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true });
diagnosticJobSchema.index({ status: 1, nextRunAt: 1, leaseUntil: 1 });

export const DiagnosticJobModel = model('DiagnosticJob', diagnosticJobSchema);
