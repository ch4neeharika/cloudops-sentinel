import type {
  AllowlistedAction,
  ExecutionStatus,
  FindingSeverity,
  JobStatus,
  PlanStatus,
  ResourceType,
  Role,
} from '../constants';

export type {
  AllowlistedAction,
  ExecutionStatus,
  FindingSeverity,
  JobStatus,
  PlanStatus,
  ResourceType,
  Role,
};

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceScoped {
  workspaceId: string;
}

export interface Versioned {
  version: number;
}

export interface CloudResource extends WorkspaceScoped, Versioned, Timestamps {
  id: string;
  provider: 'aws' | 'mock';
  type: ResourceType;
  region: string;
  arn: string;
  name: string;
  tags: Record<string, string>;
  config: ResourceConfig;
  metrics: ResourceMetrics;
  lastSyncedAt: Date;
  raw?: Record<string, unknown>;
}

export interface ResourceConfig {
  publicAccess?: boolean;
  backupEnabled?: boolean;
  alarms: string[];
  healthCheckStatus?: 'healthy' | 'unhealthy' | 'unknown';
  instanceState?: string;
  runtime?: string;
  encryption?: boolean;
}

export interface ResourceMetrics {
  cpuUtilizationAvg?: number;
  consecutiveLowUtilizationPeriods?: number;
  errorRate?: number;
  errorCount?: number;
  p99LatencyMs?: number;
  failureRateDelta?: number;
  requestCount?: number;
}

export interface HealthCheck extends WorkspaceScoped, Timestamps {
  id: string;
  resourceId: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  observedAt: Date;
}

export interface DiagnosticJob extends WorkspaceScoped, Versioned, Timestamps {
  id: string;
  status: JobStatus;
  resourceIds?: string[];
  resourceTypes?: ResourceType[];
  idempotencyKey: string;
  correlationId: string;
  leaseUntil?: Date | null;
  heartbeatAt?: Date | null;
  claimedBy?: string | null;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  lastError?: StructuredFailure | null;
  resultSummary?: JobResultSummary | null;
  createdBy: string;
  completedAt?: Date | null;
  timeoutMs: number;
}

export interface StructuredFailure {
  code: string;
  message: string;
  retryable: boolean;
  cause?: string;
  at: Date;
}

export interface JobResultSummary {
  resourcesScanned: number;
  findingsCreated: number;
  recommendationsCreated: number;
}

export interface Finding extends WorkspaceScoped, Timestamps {
  id: string;
  jobId: string;
  resourceId: string;
  ruleId: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  correlationId: string;
}

export interface Recommendation extends WorkspaceScoped, Timestamps {
  id: string;
  jobId: string;
  findingId: string;
  resourceId: string;
  actionType: AllowlistedAction | 'manual_review';
  explanation: string;
  estimatedImpact: string;
  confidence: number;
  correlationId: string;
}

export interface RemediationAction {
  actionType: AllowlistedAction;
  resourceId: string;
  findingId: string;
  params: Record<string, string>;
}

export interface RemediationPlan extends WorkspaceScoped, Versioned, Timestamps {
  id: string;
  findingIds: string[];
  actions: RemediationAction[];
  dryRun: boolean;
  status: PlanStatus;
  createdBy: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface RemediationExecution extends WorkspaceScoped, Timestamps {
  id: string;
  planId: string;
  approvalTokenId: string;
  idempotencyKey: string;
  correlationId: string;
  status: ExecutionStatus;
  dryRun: boolean;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  results: ActionResult[];
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
}

export interface ActionResult {
  actionType: AllowlistedAction;
  resourceId: string;
  ok: boolean;
  message: string;
  simulated: boolean;
}

export interface AuditEvent extends WorkspaceScoped {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface User extends WorkspaceScoped, Timestamps {
  id: string;
  email: string;
  role: Role;
  passwordHash: string;
  active: boolean;
}

export interface ApprovalToken extends WorkspaceScoped, Timestamps {
  id: string;
  planId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdBy: string;
}

export interface Workspace extends Timestamps {
  id: string;
  name: string;
}

export interface AuthClaims {
  sub: string;
  email: string;
  role: Role;
  workspaceId: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
