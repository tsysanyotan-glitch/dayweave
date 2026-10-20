import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:1420', channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npm run preview -- --port 1420', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
})
