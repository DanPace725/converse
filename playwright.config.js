import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3212",
    serviceWorkers: "block",
    launchOptions: { channel: "msedge" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/dev.js",
    url: "http://127.0.0.1:3212",
    env: { PORT: "3212" },
    reuseExistingServer: false,
  },
});
