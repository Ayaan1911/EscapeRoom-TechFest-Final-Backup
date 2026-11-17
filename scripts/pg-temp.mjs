// Disposable PostgreSQL databases for tests, rehearsals and load tests.
// Safety: only ever talks to a LOCAL server (127.0.0.1/localhost/::1); only drops databases this helper named.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ADMIN_URL = process.env.GHOST_PG_ADMIN_URL ?? "postgresql://postgres:ghosttest@127.0.0.1:55432/postgres";
const PREFIX = "ghostt_";
const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");

function assertLocal() {
  const host = new URL(ADMIN_URL).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) throw new Error(`Refusing to create/drop databases on non-local host "${host}".`);
}
export async function applyMigrations(url) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    for (const dir of readdirSync(migrations).filter(name => /^\d/.test(name)).sort()) {
      for (const chunk of readFileSync(join(migrations, dir, "migration.sql"), "utf8").split(/;\s*\n/)) {
        if (chunk.replace(/--.*$/gm, "").trim()) await client.$executeRawUnsafe(chunk);
      }
    }
  } finally { await client.$disconnect(); }
}
export async function createTempDatabase(label = "run") {
  assertLocal();
  const name = `${PREFIX}${label.replace(/[^a-z0-9]/gi, "").toLowerCase()}_${randomBytes(4).toString("hex")}`;
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  try { await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); } finally { await admin.$disconnect(); }
  const target = new URL(ADMIN_URL); target.pathname = `/${name}`;
  await applyMigrations(target.href);
  let dropped = false;
  return { name, url: target.href, async drop() {
    if (dropped) return; dropped = true;
    const again = new PrismaClient({ datasourceUrl: ADMIN_URL });
    try { await again.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); } finally { await again.$disconnect(); }
  } };
}
/** Removes leftovers from crashed runs (only databases created by this helper). */
export async function dropStaleTempDatabases() {
  assertLocal();
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  try {
    const rows = await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname LIKE '${PREFIX}%'`);
    for (const { datname } of rows) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    return rows.length;
  } finally { await admin.$disconnect(); }
}
