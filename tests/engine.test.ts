import { describe, expect, it } from "vitest";
import { bonus, complete, current, hints, initialProgress, permit, points, progressSchema, ranking, score, start, status, useHint, type Round } from "../src/lib/game/engine";
import { authorized } from "../src/lib/auth-policy";
import { digest, hashPassword, verifyPassword } from "../src/lib/password.mjs";

const waiting: Round = { startsAt: null, deadline: null, endedAt: null };
describe("authentication primitives and authorization", () => {
  it("salts and hashes access codes and rejects wrong codes", () => {
    const secret = "test-only-secret-not-a-real-code";
    const hash = hashPassword(secret);
    expect(hash).not.toContain(secret);
    expect(hashPassword(secret)).not.toBe(hash);
    expect(verifyPassword(secret, hash)).toBe(true);
    expect(verifyPassword("incorrect", hash)).toBe(false);
    expect(verifyPassword(secret, "invalid")).toBe(false);
    expect(digest(secret)).not.toBe(secret);
  });
  it("denies missing, expired and wrong-role sessions", () => {
    expect(authorized(null, "team")).toBe(false);
    expect(authorized(null, "admin")).toBe(false);
    const team = { role: "team", teamId: "A", expiresAt: new Date(2000) };
    expect(authorized(team, "team", 1000)).toBe(true);
    expect(authorized(team, "admin", 1000)).toBe(false);
    expect(authorized(team, "team", 2000)).toBe(false);
    expect(authorized({ ...team, teamId: null }, "team", 1000)).toBe(false);
  });
});
describe("round lifecycle and progression", () => {
  it("starts exactly one shared hour and cannot restart", () => {
    expect(status(waiting, 1000)).toBe("waiting");
    const round = start(waiting, 1000);
    expect(round.deadline!.getTime()).toBe(3601000);
    expect(status(round, 1000)).toBe("active");
    expect(status(round, 3601000)).toBe("finished");
    expect(status({ ...round, endedAt: new Date(2000) }, 2000)).toBe("finished");
    expect(() => start(round)).toThrow();
  });
  it("rejects early, expired and out of order submissions", () => {
    const p = initialProgress(); const round = start(waiting, 1000);
    expect(() => permit(p, waiting, 0, 1000)).toThrow();
    for (const chapter of [-1, 1, 4, 5, 0.5]) expect(() => permit(p, round, chapter, 1000)).toThrow();
    expect(() => permit(p, round, 0, 3601000)).toThrow();
    expect(() => permit(p, round, 0, 1000)).not.toThrow();
  });
  it("completes sequentially, rejects duplicate finals, and round-trips saved progress", () => {
    let p = initialProgress();
    points.forEach((value,i) => { complete(p, i, value, 1000+i); p = progressSchema.parse(JSON.parse(JSON.stringify(p))); expect(current(p)).toBe(i === 4 ? -1 : i+1); });
    expect(score(p)).toBe(100); expect(p.completedAt).toBe(1004);
    expect(() => complete(p, 4, 15, 2000)).toThrow(); expect(score(p)).toBe(100);
  });
  it("enforces two incremental hint penalties and score floor", () => {
    const p = initialProgress(); useHint(p,0); expect(score(p)).toBe(0);
    complete(p,0,15,1000); expect(score(p)).toBe(12);
    useHint(p,1); useHint(p,1); expect(score(p)).toBe(3); expect(hints(p)).toBe(3);
    expect(() => useHint(p,1)).toThrow();
  });
  it("awards bonus at most once and validates trusted scores", () => {
    const p = initialProgress(); bonus(p); expect(score(p)).toBe(5); expect(() => bonus(p)).toThrow();
    expect(() => complete(p,0,16,1000)).toThrow(); expect(() => complete(p,0,-1,1000)).toThrow();
  });
  it("supports audited zero-point progression overrides", () => {
    const p = initialProgress(); complete(p,0,0,1000,true); expect(current(p)).toBe(1); expect(p.chapters[0].override).toBe(true); expect(score(p)).toBe(0);
  });
});
describe("qualification", () => {
  it("ranks score, combined chapters, hints, completion and stable ID without mutation", () => {
    const make = (id: string) => ({ id, name: id, progress: initialProgress() });
    const a=make("A"), b=make("B"), c=make("C"), d=make("D"), e=make("E");
    a.progress.chapters[0].score=15;
    b.progress.chapters[1].score=15;
    c.progress.chapters[1].score=15; c.progress.chapters[0].score=3; c.progress.chapters[0].hints=1;
    d.progress.chapters[1].score=15; d.progress.completedAt=2000;
    e.progress.chapters[1].score=15; e.progress.completedAt=1000;
    const input=[a,c,b,d,e]; expect(ranking(input).map(t=>t.id)).toEqual(["E","D","B","C","A"]);
    expect(input[0]).toBe(a);
    expect(ranking([make("B"),make("A")]).map(t=>t.id)).toEqual(["A","B"]);
    expect(ranking(Array.from({length: 50},(_,i)=>make(String(i).padStart(2,"0")))).slice(0,12)).toHaveLength(12);
  });
});
