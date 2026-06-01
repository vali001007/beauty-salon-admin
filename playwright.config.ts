import { defineConfig } from '@playwright/test';

const e2eHost = process.env.E2E_HOST || '127.0.0.1';
const e2ePort = process.env.E2E_PORT || '55173';
const e2eBaseURL = process.env.E2E_BASE_URL || `http://${e2eHost}:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: e2eBaseURL,
    headless: true,
  },
  webServer: {
    command: `npm run dev -- --host ${e2eHost} --port ${e2ePort}`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    env: {
      VITE_API_MODE: 'mock',
      VITE_API_BASE_URL: '/api',
      VITE_MARKETING_SHARE_BASE_URL: process.env.VITE_MARKETING_SHARE_BASE_URL || 'https://mini.ami-core.com',
    },
  },
});
