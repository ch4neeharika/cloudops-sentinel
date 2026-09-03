import { Schema, model } from 'mongoose';
import { ROLES } from '../../constants';

const userSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export const UserModel = model('User', userSchema);
