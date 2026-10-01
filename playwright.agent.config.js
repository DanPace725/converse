import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";

// Agent specs own isolated HTTP servers and storage; no dev-server process needed.
export default defineConfig({
  ...config,
  testMatch: "agent.spec.js",
  webServer: undefined,
});
