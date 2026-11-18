// Fresh, seeded database for the Playwright run. Owns only the "e2e" schema.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './db-url.mjs';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const url = testDatabaseUrl('e2e');
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
  cwd: serverDir,
  env,
  stdio: 'inherit',
});
execSync('npx tsx prisma/seed.ts', { cwd: serverDir, env, stdio: 'inherit' });
