import { defineConfig } from "@playwright/test";

// Hosted rehearsal mode: GHOST_BASE_URL points the suites at a DEDICATED loadtest service (no local dev server). Fail-closed: any other host is refused.
const hosted = process.env.GHOST_BASE_URL;
if (hosted && !/^https:\/\/[^/]*loadtest[^/]*$/i.test(hosted)) throw new Error("GHOST_BASE_URL must be an https origin whose host contains 'loadtest'.");
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Phase 2 specs need the seeded P2-* teams from scripts/phase2-e2e.mjs.
  testIgnore: [...(process.env.GHOST_PHASE2 ? [] : ["**/phase6a*.spec.ts"]),...(process.env.GHOST_PHASE2 ? [] : ["**/phase2*.spec.ts"]), ...(process.env.GHOST_PHASE4 ? [] : ["**/phase4*.spec.ts"]), ...(process.env.GHOST_PHASE5 ? [] : ["**/phase5*.spec.ts"])],
  use: { baseURL: hosted ?? "http://127.0.0.1:3000" },
  webServer: hosted ? undefined : { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
});
