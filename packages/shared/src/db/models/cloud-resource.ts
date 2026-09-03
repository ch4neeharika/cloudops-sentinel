import { Schema, model } from 'mongoose';

const resourceSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    provider: { type: String, enum: ['aws', 'mock'], required: true },
    type: { type: String, required: true, index: true },
    region: { type: String, required: true },
    arn: { type: String, required: true },
    name: { type: String, required: true },
    tags: { type: Schema.Types.Mixed, default: {} },
    config: { type: Schema.Types.Mixed, default: {} },
    metrics: { type: Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date, required: true },
    version: { type: Number, default: 1 },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

resourceSchema.index({ workspaceId: 1, arn: 1 }, { unique: true });
resourceSchema.index({ workspaceId: 1, type: 1, name: 1 });

export const CloudResourceModel = model('CloudResource', resourceSchema);
