import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";
if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
const code = process.env.DEV_TEAM_CODE;
const count = Number(process.env.DEV_TEAM_COUNT || 3);
if (!code || code.length < 12 || code.length > 256) throw new Error("Set DEV_TEAM_CODE privately to 12–256 characters");
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("DEV_TEAM_COUNT must be 1–100");
const db = new PrismaClient();
try {
  await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  for (let n = 1; n <= count; n++) {
    const id = `DEV-${String(n).padStart(3, "0")}`;
    await db.team.upsert({ where: { id }, update: {}, create: { id, name: `Development team ${n}`, participants: JSON.stringify([`Participant ${n}A`, `Participant ${n}B`, `Participant ${n}C`]), codeHash: hashPassword(code), variant: ["A", "B", "C"][((n-1)%3)], progress: JSON.stringify(initialProgress()) } });
  }
  console.log(`Seed complete: ${count} development teams (DEV-001 onward). Existing teams preserved.`);
} finally { await db.$disconnect(); }
