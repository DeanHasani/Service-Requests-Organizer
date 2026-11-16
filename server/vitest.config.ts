import { defineConfig } from 'vitest/config';

// Isolated SQLite file; global setup rebuilds it from migrations before every run.
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
  SESSION_TTL_HOURS: '8',
  LOGIN_RATE_LIMIT: '1000',
};

export default defineConfig({
  test: {
    env,
    globalSetup: './tests/global-setup.ts',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
