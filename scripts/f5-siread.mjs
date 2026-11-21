// F5 evidence: which SIREAD (predicate) lock granularity do the Round 1 submission queries take under SERIALIZABLE? Disposable local DB only.
import { createTempDatabase } from "./pg-temp.mjs";
import { PrismaClient } from "@prisma/client";
const temp = await createTempDatabase("siread"), db = new PrismaClient({ datasourceUrl: temp.url });
try {
  for (let i = 1; i <= 50; i++) await db.team.create({ data: { id: `S${i}`, name: `S${i}`, participants: "[]", codeHash: "x", variant: "A", progress: "{}" } });
  await db.gameSession.create({ data: { id: 1, startsAt: new Date() } });
  const rows = await db.$transaction(async tx => {
    await tx.team.findUniqueOrThrow({ where: { id: "S1" } }); await tx.gameSession.findUniqueOrThrow({ where: { id: 1 } });
    await tx.submission.findFirst({ where: { teamId: "S1", chapter: 0 }, orderBy: { createdAt: "desc" } }); await tx.submission.count({ where: { teamId: "S1", chapter: 0, scoringVersion: { not: null } } });
    await tx.taskScore.findMany({ where: { teamId: "S1", chapter: 0 } });
    return tx.$queryRawUnsafe(`select locktype, mode, relation::regclass::text as rel, count(*)::int n from pg_locks where mode = 'SIReadLock' group by 1,2,3 order by 3,1`);
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify(rows));
} finally { await db.$disconnect(); await temp.drop(); }
