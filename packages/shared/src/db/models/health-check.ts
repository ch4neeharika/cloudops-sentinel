import { Schema, model } from 'mongoose';

const healthCheckSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    status: { type: String, enum: ['healthy', 'unhealthy', 'degraded'], required: true },
    checks: { type: [Schema.Types.Mixed], default: [] },
    observedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const HealthCheckModel = model('HealthCheck', healthCheckSchema);
