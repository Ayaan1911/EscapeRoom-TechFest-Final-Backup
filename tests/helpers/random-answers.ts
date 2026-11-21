// Seeded random VALID answers for any Round 2 task, built from the participant-facing field metadata. Test-only.
import { fieldsFor } from "../../src/lib/round2/forms.server";
import { buildAnswer, setAt, type Answer, type Field } from "../../src/lib/round2/form-types";

export function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function randomValue(f: Field, r: () => number): unknown {
  const opts = f.options ?? [], pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  if (f.kind === "single") return pick(opts).id;
  if (f.kind === "text") return undefined;
  if (f.kind === "order") return opts.map(o => o.id).sort(() => r() - 0.5);
  if (f.kind === "multi") { const n = 1 + Math.floor(r() * Math.min(f.max ?? 99, opts.length)); return opts.map(o => o.id).sort(() => r() - 0.5).slice(0, n); }
  const nk = 1 + Math.floor(r() * (f.maxKeys ?? 2)), ks = (f.keys ?? []).map(k => k.id).sort(() => r() - 0.5).slice(0, nk);
  return Object.fromEntries(ks.map(k => [k, opts.map(o => o.id).sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * (f.max ?? 4)))]));
}
export const randomAnswer = (taskId: string, r: () => number): Answer => { const fields = fieldsFor(taskId); let a: Answer = {}; for (const f of fields) { const v = randomValue(f, r); if (v !== undefined) a = setAt(a, f.path, v); } return buildAnswer(fields, a); };
