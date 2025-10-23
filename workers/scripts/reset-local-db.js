import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const wranglerTomlPath = path.join(projectRoot, 'wrangler.toml');

if (process.env.CI) {
  console.error('Refusing to reset the database when running in CI.');
  process.exit(1);
}

if (process.env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset the database while production env vars are set.');
  process.exit(1);
}

if (!fs.existsSync(wranglerTomlPath)) {
  console.error('wrangler.toml was not found. Run this from the workers directory.');
  process.exit(1);
}

const wranglerToml = fs.readFileSync(wranglerTomlPath, 'utf8');
const dbIdMatch = wranglerToml.match(/database_id\s*=\s*"([a-f0-9-]+)"/i);

if (!dbIdMatch) {
  console.error('Could not find database_id in wrangler.toml.');
  process.exit(1);
}

const dbId = dbIdMatch[1];
const normalizedDbId = dbId.replace(/-/g, '');

const d1Roots = [
  path.join(projectRoot, '.wrangler', 'state', 'v3', 'd1'),
  path.join(projectRoot, '.wrangler', 'v3', 'd1'),
];

const removedPaths = [];

for (const dir of d1Roots) {
  if (!fs.existsSync(dir)) {
    continue;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) {
    continue;
  }

  const tmpDir = `${dir}.bak-${Date.now()}`;
  fs.renameSync(dir, tmpDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  removedPaths.push(dir);
}

if (removedPaths.length === 0) {
  console.log('No local D1 state directories were found—continuing.');
} else {
  console.log('Removed local D1 state directories:');
  for (const p of removedPaths) {
    console.log(` - ${path.relative(projectRoot, p)}`);
  }
}

console.log('Reapplying migrations...');
const logDir = path.join(projectRoot, '.wrangler', 'logs');
fs.mkdirSync(logDir, { recursive: true });

try {
  execSync('pnpm db:migrate:local', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: logDir,
    },
  });
} catch (error) {
  console.error('Failed to run migrations. Try executing `pnpm db:migrate:local` manually for more detail.');
  throw error;
}

console.log('Local D1 database has been reset.');
