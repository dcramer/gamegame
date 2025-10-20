import { readFileSync } from 'fs';
import { join } from 'path';

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
