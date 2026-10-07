import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.js";

// Real WebKit engines for the authentication regressions. The ordinary
// "mobile" project uses Edge with a phone viewport and is not Safari evidence.
export default defineConfig({
  ...base,
  testMatch: ["sign-in.spec.js", "email-sign-in.spec.js"],
  outputDir: "./.agent-smoke/auth-results",
  use: { ...base.use, baseURL: "http://127.0.0.1:3213", launchOptions: {} },
  projects: [
    {
      name: "edge-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        launchOptions: { channel: "msedge" },
      },
    },
    {
      name: "edge-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        defaultBrowserType: "chromium",
        launchOptions: { channel: "msedge" },
      },
    },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    ...base.webServer,
    url: "http://127.0.0.1:3213",
    env: { PORT: "3213" },
  },
});
