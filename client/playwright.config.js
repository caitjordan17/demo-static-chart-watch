import { defineConfig } from '@playwright/test';

// Test production assets under a repository path, as GitHub Pages serves them.
const preview = Boolean(process.env.PDF_TEST_PREVIEW);
const baseURL = `http://127.0.0.1:3100/${preview ? 'chartwatch-demo/' : ''}`;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: preview
      ? 'npm run preview -- --base /chartwatch-demo/ --host 127.0.0.1 --port 3100 --strictPort'
      : 'npm run dev -- --host 127.0.0.1 --port 3100 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
