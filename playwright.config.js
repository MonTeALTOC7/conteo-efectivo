import { defineConfig } from '@playwright/test';

const firebase = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 50000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    env: { VITE_USE_FIREBASE_EMULATOR: firebase ? '1' : '0' },
    timeout: 30000
  }
});
