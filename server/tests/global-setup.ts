import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './db-url.mjs';

// The suite owns the "test" schema: wipe it and apply migrations before every run.
export default function setup() {
  const url = testDatabaseUrl('test');
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
