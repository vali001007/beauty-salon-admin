import { defineConfig } from '@playwright/test';

const host = process.env.E2E_HOST || '127.0.0.1';
const port = process.env.E2E_PORT || '55174';
const baseURL = process.env.E2E_BASE_URL || `http://${host}:${port}`;
const executablePath = process.env.E2E_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'brain-governance-v2.spec.ts',
  timeout: 30_000,
  use: {
    baseURL,
    headless: true,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: '/api',
      VITE_BRAIN_GOVERNANCE_UI_V2: 'manage',
      VITE_BRAIN_GOVERNANCE_NAV_MODE: 'compact',
      VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE: 'redirect',
    },
  },
});
