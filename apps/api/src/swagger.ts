import { readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';

export function loadOpenApiSpec(): Record<string, unknown> {
  const candidates = [
    path.resolve(__dirname, '../../../docs/openapi.yaml'),
    path.resolve(process.cwd(), 'docs/openapi.yaml'),
    path.resolve(process.cwd(), '../../docs/openapi.yaml'),
  ];
  for (const file of candidates) {
    try {
      return YAML.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return {
    openapi: '3.0.3',
    info: { title: 'CloudOps Sentinel API', version: '1.0.0' },
    paths: {},
  };
}
