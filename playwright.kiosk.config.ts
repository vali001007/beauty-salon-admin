import { defineConfig } from '@playwright/test';

const e2eHost = process.env.E2E_KIOSK_HOST || '127.0.0.1';
const e2ePort = process.env.E2E_KIOSK_PORT || '55175';
const e2eBaseURL = process.env.E2E_KIOSK_BASE_URL || `http://${e2eHost}:${e2ePort}`;
const shouldStartWebServer = process.env.E2E_KIOSK_SKIP_WEBSERVER !== '1';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export default defineConfig({
  testDir: './packages/Ami-Aura-Lite-Kiosk/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: e2eBaseURL,
    headless: true,
  },
  webServer: shouldStartWebServer
    ? {
        command: `${npmCommand} --prefix packages/Ami-Aura-Lite-Kiosk run dev:web -- --host ${e2eHost} --port ${e2ePort} --strictPort`,
        url: e2eBaseURL,
        reuseExistingServer: false,
        timeout: 90_000,
        env: {
          VITE_API_BASE_URL: '/api',
          VITE_KIOSK_DEV_HOST: e2eHost,
          VITE_KIOSK_DEV_PORT: e2ePort,
        },
      }
    : undefined,
});
