import { defineConfig } from "@playwright/test";

// Hosted rehearsal mode: GHOST_BASE_URL points the suites at a DEDICATED loadtest service (no local dev server). Fail-closed: any other host is refused.
const hosted = process.env.GHOST_BASE_URL;
if (hosted && !/^https:\/\/[^/]*loadtest[^/]*$/i.test(hosted)) throw new Error("GHOST_BASE_URL must be an https origin whose host contains 'loadtest'.");
// GHOST_E2E_PORT lets the suites run beside a live server on :3000 (e.g. on the event machine) without touching it.
const port = process.env.GHOST_E2E_PORT ?? "3000";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Phase 2 specs need the seeded P2-* teams from scripts/phase2-e2e.mjs.
  testIgnore: [...(process.env.GHOST_R2_LEGACY ? [] : ["**/phase4-round2.spec.ts", "**/phase5-round2.spec.ts", "**/phase5-visual.spec.ts", "**/organizer-ties.spec.ts"]), ...(process.env.GHOST_PHASE2 ? [] : ["**/phase6a*.spec.ts"]),...(process.env.GHOST_PHASE2 ? [] : ["**/phase2*.spec.ts"]), ...(process.env.GHOST_PHASE4 ? [] : ["**/phase4*.spec.ts"]), ...(process.env.GHOST_PHASE5 ? [] : ["**/phase5*.spec.ts"])],
  use: { baseURL: hosted ?? `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: hosted ? undefined : { command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
});
