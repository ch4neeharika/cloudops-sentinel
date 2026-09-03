export const ROLES = ['admin', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCE_TYPES = ['ec2', 's3', 'lambda', 'cloudwatch'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const JOB_STATUSES = [
  'pending',
  'running',
  'retry_wait',
  'completed',
  'failed',
  'dead_lettered',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const PLAN_STATUSES = [
  'draft',
  'awaiting_approval',
  'approved',
  'executing',
  'completed',
  'failed',
  'rejected',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const EXECUTION_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'partial_failure',
  'failed',
  'skipped_duplicate',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ALLOWLISTED_ACTIONS = [
  'add_missing_tag',
  'create_alarm',
  'enable_backup_policy',
  'restart_unhealthy_service',
  'restrict_public_storage',
] as const;
export type AllowlistedAction = (typeof ALLOWLISTED_ACTIONS)[number];

export const REQUIRED_TAGS = ['Environment', 'Owner', 'CostCenter', 'Service'] as const;

export const POLICY_RULE_IDS = [
  'ec2.low_utilization',
  'resource.missing_tags',
  's3.public_access',
  'cloudwatch.missing_alarms',
  'service.unhealthy',
  'resource.missing_backup',
  'app.repeated_errors',
  'api.elevated_latency',
  'reliability.failure_rate_increase',
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
