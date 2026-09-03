import client from 'prom-client';

export function createMetricsRegistry(serviceName: string) {
  const register = new client.Registry();
  register.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [register],
  });

  const httpErrorsTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total HTTP 5xx responses',
    labelNames: ['method', 'route'] as const,
    registers: [register],
  });

  const jobProcessingDuration = new client.Histogram({
    name: 'job_processing_duration_seconds',
    help: 'Time spent processing a diagnostic job',
    labelNames: ['status'] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20],
    registers: [register],
  });

  const jobRetriesTotal = new client.Counter({
    name: 'job_retries_total',
    help: 'Jobs scheduled for retry',
    registers: [register],
  });

  const jobDeadLetterTotal = new client.Counter({
    name: 'job_dead_letter_total',
    help: 'Jobs moved to dead-letter',
    registers: [register],
  });

  const workerQueueDepth = new client.Gauge({
    name: 'worker_queue_depth',
    help: 'Pending + retry_wait diagnostic jobs',
    registers: [register],
  });

  const remediationSuccessTotal = new client.Counter({
    name: 'remediation_success_total',
    help: 'Successful remediation actions',
    labelNames: ['action'] as const,
    registers: [register],
  });

  const remediationFailureTotal = new client.Counter({
    name: 'remediation_failure_total',
    help: 'Failed remediation actions',
    labelNames: ['action'] as const,
    registers: [register],
  });

  return {
    register,
    httpRequestDuration,
    httpRequestsTotal,
    httpErrorsTotal,
    jobProcessingDuration,
    jobRetriesTotal,
    jobDeadLetterTotal,
    workerQueueDepth,
    remediationSuccessTotal,
    remediationFailureTotal,
    observeHttp(method: string, route: string, statusCode: number, durationSeconds: number) {
      const status = String(statusCode);
      httpRequestDuration.observe({ method, route, status_code: status }, durationSeconds);
      httpRequestsTotal.inc({ method, route, status_code: status });
      if (statusCode >= 500) {
        httpErrorsTotal.inc({ method, route });
      }
    },
  };
}

export type Metrics = ReturnType<typeof createMetricsRegistry>;
