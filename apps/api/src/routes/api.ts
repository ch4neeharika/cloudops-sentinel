import { Router, type Request } from 'express';
import {
  listAuditQuerySchema,
  listFindingsQuerySchema,
  listJobsQuerySchema,
  listRecommendationsQuerySchema,
  listResourcesQuerySchema,
  syncResourcesSchema,
  createDiagnosticJobSchema,
  createRemediationPlanSchema,
  executeRemediationSchema,
  NotFoundError,
  ValidationError,
} from '@cloudops/shared';
import { validate } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import { ResourceService } from '../services/resource-service';
import { JobService } from '../services/job-service';
import { RemediationService } from '../services/remediation-service';
import { listAuditEvents, listFindings, listRecommendations } from '../services/query-service';
import type { ApiConfig } from '../config';

function routeId(req: Request): string {
  const id = req.params.id;
  if (!id) throw new ValidationError('Missing resource id');
  return id;
}

export function apiRouter(config: ApiConfig): Router {
  const router = Router();
  const resources = new ResourceService(config);
  const jobs = new JobService(config.WORKER_MAX_ATTEMPTS, config.WORKER_JOB_TIMEOUT_MS);
  const remediations = new RemediationService(config);

  router.post(
    '/resources/sync',
    requireRole('admin', 'operator'),
    validate(syncResourcesSchema),
    async (req, res, next) => {
      try {
        const result = await resources.sync(
          req.auth!.workspaceId,
          req.auth!.sub,
          req.correlationId!,
          req.body,
        );
        res.status(202).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/resources', validate(listResourcesQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await resources.list(req.auth!.workspaceId, {
        page: Number(req.query.page),
        limit: Number(req.query.limit),
        type: req.query.type as string | undefined,
        region: req.query.region as string | undefined,
        q: req.query.q as string | undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/resources/:id', async (req, res, next) => {
    try {
      const item = await resources.get(req.auth!.workspaceId, routeId(req));
      if (!item) throw new NotFoundError('Resource not found');
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/diagnostics',
    requireRole('admin', 'operator'),
    validate(createDiagnosticJobSchema),
    async (req, res, next) => {
      try {
        const result = await jobs.create(
          req.auth!.workspaceId,
          req.auth!.sub,
          req.correlationId!,
          req.body,
        );
        res.status(result.replayed ? 200 : 202).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/jobs', validate(listJobsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await jobs.list(req.auth!.workspaceId, {
        page: Number(req.query.page),
        limit: Number(req.query.limit),
        status: req.query.status as string | undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await jobs.get(req.auth!.workspaceId, routeId(req));
      if (!job) throw new NotFoundError('Job not found');
      res.json(job);
    } catch (err) {
      next(err);
    }
  });

  router.post('/jobs/:id/retry', requireRole('admin', 'operator'), async (req, res, next) => {
    try {
      const job = await jobs.retry(
        req.auth!.workspaceId,
        routeId(req),
        req.auth!.sub,
        req.correlationId!,
      );
      res.json(job);
    } catch (err) {
      next(err);
    }
  });

  router.get('/findings', validate(listFindingsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await listFindings(req.auth!.workspaceId, {
        page: Number(req.query.page),
        limit: Number(req.query.limit),
        severity: req.query.severity as string | undefined,
        resourceId: req.query.resourceId as string | undefined,
        jobId: req.query.jobId as string | undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/recommendations',
    validate(listRecommendationsQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const result = await listRecommendations(req.auth!.workspaceId, {
          page: Number(req.query.page),
          limit: Number(req.query.limit),
          actionType: req.query.actionType as string | undefined,
          jobId: req.query.jobId as string | undefined,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/remediations/plan',
    requireRole('admin', 'operator'),
    validate(createRemediationPlanSchema),
    async (req, res, next) => {
      try {
        const result = await remediations.createPlan(
          req.auth!.workspaceId,
          req.auth!.sub,
          req.correlationId!,
          req.body,
        );
        res.status(result.replayed ? 200 : 201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/remediations/:id/approve', requireRole('admin'), async (req, res, next) => {
    try {
      const result = await remediations.approve(
        req.auth!.workspaceId,
        routeId(req),
        req.auth!.sub,
        req.correlationId!,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/remediations/:id/execute',
    requireRole('admin', 'operator'),
    validate(executeRemediationSchema),
    async (req, res, next) => {
      try {
        const result = await remediations.execute(
          req.auth!.workspaceId,
          routeId(req),
          req.auth!.sub,
          req.correlationId!,
          req.body,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/audit-events',
    requireRole('admin', 'operator'),
    validate(listAuditQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const result = await listAuditEvents(req.auth!.workspaceId, {
          page: Number(req.query.page),
          limit: Number(req.query.limit),
          action: req.query.action as string | undefined,
          actorId: req.query.actorId as string | undefined,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
