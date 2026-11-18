import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from './server/tests/db-url.mjs';

// Isolated ports and database schema ("e2e") so an e2e run never touches dev data.
const E2E_DB = testDatabaseUrl('e2e');
const API_PORT = 4100;
const WEB_PORT = 5174;
const env = {
  DATABASE_URL: E2E_DB,
  DIRECT_URL: E2E_DB,
  SEED_PASSWORD: 'Deskflow!2026',
  NODE_ENV: 'test',
  LOGIN_RATE_LIMIT: '1000',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:serve -w server',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { ...env, PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -w client -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
