import { readFileSync } from 'fs';
import { join } from 'path';
import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types';

export function loadDevVars(): Record<string, string> {
  try {
    const devVarsPath = join(process.cwd(), '.dev.vars');
    const content = readFileSync(devVarsPath, 'utf-8');
    const vars: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Z_]+)=(.+)$/);
      if (match) {
        vars[match[1]] = match[2];
      }
    }

    return vars;
  } catch (error: any) {
    console.error('Error loading .dev.vars:', error.message);
    console.error('Make sure .dev.vars exists and contains required variables');
    process.exit(1);
  }
}

export function getApiUrl(isRemote: boolean): string {
  if (isRemote) {
    return 'https://gamegame.ai';
  }
  return 'http://localhost:4000';
}

/**
 * Get local D1 database connection for CLI commands
 * Uses the local .wrangler/state/v3/d1 database
 */
export async function getLocalD1(): Promise<D1Database> {
  const { getPlatformProxy } = await import('wrangler');
  const { env } = await getPlatformProxy();
  return env.DB as D1Database;
}

/**
 * Get Vectorize index connection for CLI commands
 * Note: Local Vectorize is not supported, this connects to remote
 */
export async function getLocalVectorize(): Promise<VectorizeIndex> {
  const { getPlatformProxy } = await import('wrangler');
  const { env } = await getPlatformProxy();
  return env.VECTORIZE as VectorizeIndex;
}
