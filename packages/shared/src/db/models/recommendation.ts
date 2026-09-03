import { Schema, model } from 'mongoose';

const recommendationSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    jobId: { type: String, required: true, index: true },
    findingId: { type: String, required: true },
    resourceId: { type: String, required: true },
    actionType: { type: String, required: true },
    explanation: { type: String, required: true },
    estimatedImpact: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);

recommendationSchema.index({ workspaceId: 1, findingId: 1 }, { unique: true });

export const RecommendationModel = model('Recommendation', recommendationSchema);
