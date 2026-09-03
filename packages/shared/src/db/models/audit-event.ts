import { Schema, model } from 'mongoose';

const auditEventSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    actorId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    correlationId: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: false, versionKey: false },
);

auditEventSchema.index({ workspaceId: 1, createdAt: -1 });

export const AuditEventModel = model('AuditEvent', auditEventSchema);
