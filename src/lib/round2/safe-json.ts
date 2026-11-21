import { createHash } from "node:crypto";
// Defensive JSON helpers for untrusted Round 2 input. Pure; no server-only so tests and routes can share them.
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
export class UnsafeJson extends Error {}
/** JSON.parse that rejects prototype-polluting keys anywhere in the document and oversized or too-deep input. */
export function parseSafeJson(raw: string, maxBytes: number, maxDepth = 6): unknown {
  if (Buffer.byteLength(raw) > maxBytes) throw new UnsafeJson("too large");
  const value = JSON.parse(raw, function (key, v) { if (DANGEROUS.has(key)) throw new UnsafeJson("forbidden key"); return v; });
  if (depth(value) > maxDepth) throw new UnsafeJson("too deep");
  return value;
}
function depth(v: unknown): number { return v !== null && typeof v === "object" ? 1 + Math.max(0, ...Object.values(v as object).map(depth)) : 0; }
/** Deterministic JSON (sorted keys) so equal answers hash equally regardless of key order. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
export const answerHash = (v: unknown) => createHash("sha256").update(stableStringify(v)).digest("hex");
