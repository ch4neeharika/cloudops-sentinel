import { ALLOWLISTED_ACTIONS, type AllowlistedAction } from '../constants';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';
import type { ActionResult, CloudResource, RemediationAction } from '../types';

export function assertAllowlisted(actionType: string): asserts actionType is AllowlistedAction {
  if (!ALLOWLISTED_ACTIONS.includes(actionType as AllowlistedAction)) {
    throw new ForbiddenError(`Action ${actionType} is not allowlisted`);
  }
}

export function applySimulatedAction(
  resource: {
    tags: Record<string, string>;
    config: CloudResource['config'];
    metrics: CloudResource['metrics'];
  },
  action: RemediationAction,
): { resource: typeof resource; result: ActionResult } {
  assertAllowlisted(action.actionType);
  const next = {
    tags: { ...resource.tags },
    config: { ...resource.config, alarms: [...(resource.config.alarms ?? [])] },
    metrics: { ...resource.metrics },
  };

  switch (action.actionType) {
    case 'add_missing_tag': {
      const key = action.params.key ?? 'Owner';
      const value = action.params.value ?? 'platform';
      next.tags[key] = value;
      return {
        resource: next,
        result: {
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: true,
          simulated: true,
          message: `Added tag ${key}=${value}`,
        },
      };
    }
    case 'create_alarm': {
      const alarm = action.params.alarmName ?? `${action.resourceId}-health`;
      if (!next.config.alarms.includes(alarm)) next.config.alarms.push(alarm);
      return {
        resource: next,
        result: {
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: true,
          simulated: true,
          message: `Created simulated alarm ${alarm}`,
        },
      };
    }
    case 'enable_backup_policy': {
      next.config.backupEnabled = true;
      return {
        resource: next,
        result: {
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: true,
          simulated: true,
          message: 'Enabled simulated backup policy',
        },
      };
    }
    case 'restart_unhealthy_service': {
      next.config.healthCheckStatus = 'healthy';
      next.metrics.errorRate = Math.min(next.metrics.errorRate ?? 0, 0.01);
      return {
        resource: next,
        result: {
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: true,
          simulated: true,
          message: 'Restarted simulated unhealthy service',
        },
      };
    }
    case 'restrict_public_storage': {
      next.config.publicAccess = false;
      return {
        resource: next,
        result: {
          actionType: action.actionType,
          resourceId: action.resourceId,
          ok: true,
          simulated: true,
          message: 'Restricted simulated public storage access',
        },
      };
    }
    default:
      throw new ValidationError(`Unsupported action ${action.actionType}`);
  }
}

export function rejectMutationsIfDisabled(enableAwsMutations: boolean, providerName: string): void {
  if (providerName === 'aws' && !enableAwsMutations) {
    throw new ForbiddenError(
      'Real AWS mutations are disabled. Set ENABLE_AWS_MUTATIONS=true only after explicit confirmation.',
    );
  }
}

export function assertIdempotentExecution(existingStatus: string | undefined): void {
  if (existingStatus === 'succeeded' || existingStatus === 'running') {
    throw new ConflictError('Duplicate remediation execution blocked by idempotency key', {
      status: existingStatus,
    });
  }
}
