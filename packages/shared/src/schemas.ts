import { z } from 'zod';
import { ALLOWLISTED_ACTIONS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, RESOURCE_TYPES } from './constants';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const syncResourcesSchema = z.object({
  types: z.array(z.enum(RESOURCE_TYPES)).optional(),
  region: z.string().min(1).optional(),
});

export const createDiagnosticJobSchema = z.object({
  resourceIds: z.array(z.string().min(1)).optional(),
  resourceTypes: z.array(z.enum(RESOURCE_TYPES)).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const createRemediationPlanSchema = z.object({
  findingIds: z.array(z.string().min(1)).min(1),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(8).max(128),
});

export const approveRemediationSchema = z.object({
  note: z.string().max(500).optional(),
});

export const executeRemediationSchema = z.object({
  approvalToken: z.string().min(16),
  idempotencyKey: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const listResourcesQuerySchema = paginationSchema.extend({
  type: z.enum(RESOURCE_TYPES).optional(),
  region: z.string().optional(),
  q: z.string().max(120).optional(),
});

export const listJobsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
});

export const listFindingsQuerySchema = paginationSchema.extend({
  severity: z.string().optional(),
  resourceId: z.string().optional(),
  jobId: z.string().optional(),
});

export const listRecommendationsQuerySchema = paginationSchema.extend({
  actionType: z.enum([...ALLOWLISTED_ACTIONS, 'manual_review'] as const).optional(),
  jobId: z.string().optional(),
});

export const listAuditQuerySchema = paginationSchema.extend({
  action: z.string().optional(),
  actorId: z.string().optional(),
});

export type SyncResourcesInput = z.infer<typeof syncResourcesSchema>;
export type CreateDiagnosticJobInput = z.infer<typeof createDiagnosticJobSchema>;
export type CreateRemediationPlanInput = z.infer<typeof createRemediationPlanSchema>;
