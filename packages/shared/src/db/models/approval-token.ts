import { Schema, model } from 'mongoose';

const approvalTokenSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    planId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

export const ApprovalTokenModel = model('ApprovalToken', approvalTokenSchema);
