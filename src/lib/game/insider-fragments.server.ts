import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const canonical = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
const fragment = (part: "A" | "B") => `${part}-${randomBytes(12).toString("hex").toUpperCase().match(/.{6}/g)!.join("-")}`;
export const insiderFragmentSchema = z.object({ fragmentA: z.string().max(64).transform(canonical).pipe(z.string().regex(/^A[A-F0-9]{24}$/)), fragmentB: z.string().max(64).transform(canonical).pipe(z.string().regex(/^B[A-F0-9]{24}$/)) }).strict();
export function newInsiderFragments() { return { fragmentA: fragment("A"), fragmentB: fragment("B") }; }
export function matchesInsiderFragments(expected: { fragmentA: string; fragmentB: string }, supplied: unknown) {
  const parsed = insiderFragmentSchema.safeParse(supplied);
  if (!parsed.success) return false;
  const digest = (value: string) => createHash("sha256").update(canonical(value)).digest();
  const a = timingSafeEqual(digest(expected.fragmentA), digest(parsed.data.fragmentA));
  const b = timingSafeEqual(digest(expected.fragmentB), digest(parsed.data.fragmentB));
  return a && b;
}
export function insiderWallStation(teamId: string) { return ["A", "B", "C", "D", "E"][createHash("sha256").update(teamId).digest().readUInt32BE(0) % 5]; }
export function insiderPrintPages(cards: { teamId: string; station: string; fragment: string }[], part: "A" | "B") {
  const pages = [];
  for (const station of part === "A" ? ["PRIVATE"] : ["A", "B", "C", "D", "E"]) {
    const group = station === "PRIVATE" ? cards : cards.filter(card => card.station === station);
    for (let index = 0; index < group.length; index += 12) pages.push({ station, cards: group.slice(index, index + 12) });
  }
  return pages;
}
