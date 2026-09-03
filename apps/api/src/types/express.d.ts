import type { AuthClaims } from '@cloudops/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      correlationId?: string;
    }
  }
}

export {};
