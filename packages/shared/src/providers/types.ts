import type { CloudResource, ResourceType } from '../types';

export interface InventoryQuery {
  types?: ResourceType[];
  region?: string;
}

export interface CloudProvider {
  readonly name: 'mock' | 'aws';
  readonly readOnly: boolean;
  listResources(
    query?: InventoryQuery,
  ): Promise<Omit<CloudResource, 'id' | 'createdAt' | 'updatedAt'>[]>;
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, opts?: { retryable?: boolean; code?: string }) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = opts?.retryable ?? false;
    this.code = opts?.code ?? 'PROVIDER_ERROR';
  }
}
