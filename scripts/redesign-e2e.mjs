// Runs the redesign browser specs against a DISPOSABLE local PostgreSQL database and the local dev server. Never touches hosted services.
//   node scripts/redesign-e2e.mjs [spec ...]     (default: tests/ui-unlock.spec.ts)
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const specs = process.argv.slice(2).length ? process.argv.slice(2) : ["tests/ui-unlock.spec.ts"];
const temp = await createTempDatabase("redesign"), code = randomBytes(18).toString("hex");
const db = new PrismaClient({ datasourceUrl: temp.url });
let status = 1;
try {
  await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000), scoringPolicy: "best-v1" } });
  for (const [id, variant] of [["UI-A", "A"], ["UI-B", "B"], ["UI-C", "C"], ["UI-D", "A"]]) await db.team.create({ data: { id, name: `UI fixture ${id}`, participants: JSON.stringify(["Investigator One"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(initialProgress()) } });
  const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: "http://127.0.0.1:3000", GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code, GHOST_E2E_REDESIGN: "1" };
  status = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "test", ...specs, "--workers=1", "--reporter=list"], { env, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
} finally { await db.$disconnect(); await temp.drop(); }
process.exit(status);
