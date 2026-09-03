export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? 'INTERNAL_ERROR';
    this.retryable = params.retryable ?? false;
    this.details = params.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 400, code: 'VALIDATION_ERROR', details });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super({ message, statusCode: 401, code: 'UNAUTHORIZED' });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super({ message, statusCode: 403, code: 'FORBIDDEN' });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super({ message, statusCode: 404, code: 'NOT_FOUND' });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 409, code: 'CONFLICT', details });
    this.name = 'ConflictError';
  }
}

export class DependencyError extends AppError {
  constructor(message: string, retryable = true) {
    super({ message, statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE', retryable });
    this.name = 'DependencyError';
  }
}
