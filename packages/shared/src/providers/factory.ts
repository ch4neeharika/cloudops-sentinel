import { AwsProvider } from './aws';
import { MockAwsProvider } from './mock';
import type { CloudProvider } from './types';

export interface ProviderFactoryConfig {
  mode: 'mock' | 'aws';
  workspaceId: string;
  region: string;
  readOnly: boolean;
  maxAttempts: number;
  requestTimeoutMs: number;
  endpoint?: string;
}

export function createCloudProvider(cfg: ProviderFactoryConfig): CloudProvider {
  if (cfg.mode === 'aws') {
    return new AwsProvider({
      region: cfg.region,
      workspaceId: cfg.workspaceId,
      readOnly: cfg.readOnly,
      maxAttempts: cfg.maxAttempts,
      requestTimeoutMs: cfg.requestTimeoutMs,
      endpoint: cfg.endpoint,
    });
  }
  return new MockAwsProvider(cfg.workspaceId);
}
