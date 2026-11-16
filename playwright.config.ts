import { defineConfig, devices } from '@playwright/test';

// Isolated ports and database so an e2e run never touches dev data.
const API_PORT = 4100;
const WEB_PORT = 5174;
const env = {
  DATABASE_URL: 'file:./e2e.db',
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
