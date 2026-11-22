// Helper for the lab PowerShell scripts. Never prints secrets.
//   node scripts/lab/lab-tool.mjs hash            (organizer code from env GHOST_LAB_SECRET -> prints the stored hash)
//   node scripts/lab/lab-tool.mjs db-check        (DATABASE_URL from the environment; read-only: identity + counts)
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/password.mjs";

const cmd = process.argv[2];
if (cmd === "hash") {
  const s = process.env.GHOST_LAB_SECRET;
  if (!s || s.length < 12 || s.length > 256) { console.error("Organizer code must be 12-256 characters"); process.exit(2); }
  console.log(hashPassword(s));
} else if (cmd === "db-check") {
  const db = new PrismaClient();
  try {
    const [{ name }] = await db.$queryRaw`select current_database() as name`;
    const migrations = await db.$queryRaw`select count(*)::int as n from "_prisma_migrations" where finished_at is not null`.catch(() => [{ n: -1 }]);
    const out = { database: name, migrationsApplied: migrations[0].n };
    if (migrations[0].n > 0) {
      const round = await db.gameSession.findUnique({ where: { id: 1 } }), r2 = await db.r2Session.findUnique({ where: { id: 1 } });
      Object.assign(out, { teams: await db.team.count(), round1: !round?.startsAt ? "not started" : round.endedAt ? "ended" : "started", round2: !r2?.startsAt ? "not started" : r2.endedAt ? "ended" : "started" });
    }
    console.log(JSON.stringify(out));
  } catch (e) { console.error("DB_UNREACHABLE: " + String(e.message).split("\n").filter(Boolean).slice(-1)[0]); process.exit(3); }
  finally { await db.$disconnect(); }
} else { console.error("usage: lab-tool.mjs hash|db-check"); process.exit(1); }
