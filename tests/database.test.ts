import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialProgress } from "../src/lib/game/engine";
import { hashPassword } from "../src/lib/password.mjs";

const jar = vi.hoisted(() => new Map<string,string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string,value: string) => jar.set(key,value), delete: (key: string) => jar.delete(key) }) }));

// Opt in only after installing Prisma and generating the client; always uses a fresh temporary DB.
describe.runIf(process.env.GHOST_DB_TEST === "1")("Prisma persistence and session integration", () => {
  let folder: string;
  let db: typeof import("../src/lib/db").db;
  let auth: typeof import("../src/lib/auth");
  let service: typeof import("../src/lib/game/service");
  const code = "temporary-test-access-only";
  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), "ghost-test-"));
    process.env.DATABASE_URL = `file:${join(folder,"test.db").replaceAll("\\","/")}`;
    process.env.ADMIN_ACCESS_HASH = hashPassword(code);
    ({ db } = await import("../src/lib/db"));
    auth = await import("../src/lib/auth");
    service = await import("../src/lib/game/service");
    for (const statement of readFileSync("prisma/migrations/202611170001_engine/migration.sql","utf8").split(";").filter(s=>s.trim())) await db.$executeRawUnsafe(statement);
    for (const id of ["A","B"]) await db.team.create({ data: { id, name:id, participants:JSON.stringify(["One","Two","Three"]), codeHash:hashPassword(code), variant:"A", progress:JSON.stringify(initialProgress()) } });
  });
  afterAll(async () => { if(db) await db.$disconnect(); if(folder) rmSync(folder, { recursive:true, force:true }); });
  it("logs in, isolates team identity, survives reads and invalidates logout", async () => {
    expect(await auth.session("team")).toBeNull();
    expect(await auth.login("team","A","wrong-code")).toBe(false);
    expect(await auth.login("team","A",code)).toBe(true);
    expect((await auth.session("team"))?.teamId).toBe("A");
    expect(await auth.session("admin")).toBeNull();
    expect((await auth.session("team"))?.teamId).toBe("A");
    const token = jar.get(auth.cookieName)!;
    await auth.logout(); jar.set(auth.cookieName,token);
    expect(await auth.session("team")).toBeNull(); jar.clear();
  });
  it("protects admin and participant APIs", async () => {
    const game = await import("../src/app/api/game/route");
    const scores = await import("../src/app/api/admin/scores/route");
    expect((await game.GET()).status).toBe(401);
    expect((await scores.GET()).status).toBe(401);
    await auth.login("team","A",code);
    expect((await scores.GET()).status).toBe(401);
    const data = await (await game.GET()).json(); expect(data.id).toBe("A"); expect(data.codeHash).toBeUndefined();
    await auth.logout();
    await auth.login("admin","organizer",code);
    expect(await auth.session("team")).toBeNull(); expect((await scores.GET()).status).toBe(200);
    await auth.logout();
  });
  it("persists shared start, audited override and rejects duplicate and late attempts", async () => {
    await service.roundState(); await service.control("start");
    const a = await service.teamState("A"), b=await service.teamState("B");
    expect(a.round.deadline?.getTime()).toBe(b.round.deadline?.getTime());
    expect(a.round.deadline!.getTime()-a.round.startsAt!.getTime()).toBe(3600000);
    await expect(service.control("start")).rejects.toThrow();
    await service.control("unlock","A","Organizer confirmed a stuck workspace");
    expect((await service.teamState("A")).current).toBe(1);
    expect((await service.teamState("A")).score).toBe(0);
    expect((await service.mutateTeam("A",0,"submit",{})).error).toBeDefined();
    expect(await db.auditLog.count({where:{action:"unlock"}})).toBe(1);
    const { validators } = await import("../src/lib/game/validators");
    // Test-only fixture, never a real chapter answer key.
    validators[1] = { validate: () => ({ correct:true, points:25, tamperDetected:true }), hints:["Test hint one","Test hint two"] };
    expect((await service.mutateTeam("A",1,"hint",null)).hint).toBe("Test hint one");
    expect((await service.mutateTeam("A",1,"hint",null)).hint).toBe("Test hint two");
    expect((await service.mutateTeam("A",1,"hint",null)).error).toBeDefined();
    expect((await service.mutateTeam("A",1,"submit",{})).accepted).toBe(true);
    expect((await service.teamState("A")).score).toBe(21);
    expect((await service.mutateTeam("A",1,"submit",{})).error).toBeDefined();
    await db.$disconnect();
    expect((await service.teamState("A")).current).toBe(2);
    delete validators[1];
    await service.control("stop"); expect((await service.teamState("A")).status).toBe("finished");
    expect((await service.mutateTeam("A",2,"submit",{})).error).toBeDefined();
    expect(await db.submission.count()).toBe(4);
  });
});
