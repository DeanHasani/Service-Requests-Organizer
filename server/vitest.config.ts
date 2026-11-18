import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './tests/db-url.mjs';

// Isolated Postgres schema ("test"); global setup rebuilds it from migrations before every run.
const url = testDatabaseUrl('test');
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: url,
  DIRECT_URL: url,
  SESSION_TTL_HOURS: '8',
  LOGIN_RATE_LIMIT: '1000',
};

export default defineConfig({
  test: {
    env,
    globalSetup: './tests/global-setup.ts',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
