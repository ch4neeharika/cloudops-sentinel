import { Schema, model } from 'mongoose';

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const WorkspaceModel = model('Workspace', workspaceSchema);
