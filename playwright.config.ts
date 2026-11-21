import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Phase 2 specs need the seeded P2-* teams from scripts/phase2-e2e.mjs.
  testIgnore: [...(process.env.GHOST_PHASE2 ? [] : ["**/phase6a*.spec.ts"]),...(process.env.GHOST_PHASE2 ? [] : ["**/phase2*.spec.ts"]), ...(process.env.GHOST_PHASE4 ? [] : ["**/phase4*.spec.ts"]), ...(process.env.GHOST_PHASE5 ? [] : ["**/phase5*.spec.ts"])],
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
});
