// Client-safe (no server-only) form metadata types and pure answer helpers shared by the Round 2 UI and its tests.
// A task's answer is assembled ONLY from its declared fields, so the submitted object can never contain extra keys for the strict server schemas.
export type Opt = { id: string; text: string };
export type FieldKind = "single" | "multi" | "order" | "text" | "keyed";
export type Field = {
  kind: FieldKind;
  path: string[];          // where the value lives inside the answer object
  label: string;
  options?: Opt[];         // choices (single/multi/order) or record options (keyed)
  keys?: Opt[];            // keyed: the connection ids a participant may map evidence onto
  min?: number; max?: number; maxKeys?: number;
  optional?: boolean;      // optional fields never block submission (e.g. the ungraded note)
  ref?: string;            // id of an evidence record this field is about (the UI shows it inline)
  hint?: string;
};
export type Answer = Record<string, unknown>;
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
const safe = (path: string[]) => path.every(k => !DANGEROUS.has(k));

export function getAt(answer: Answer, path: string[]): unknown {
  let cur: unknown = answer;
  for (const key of path) { if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, key)) return undefined; cur = (cur as Record<string, unknown>)[key]; }
  return cur;
}
/** Immutable set (never mutates the input). Refuses prototype-polluting path segments. */
export function setAt(answer: Answer, path: string[], value: unknown): Answer {
  if (!path.length || !safe(path)) return answer;
  const [head, ...rest] = path;
  const child = rest.length ? setAt((Object.hasOwn(answer, head) && typeof answer[head] === "object" && answer[head] !== null ? answer[head] : {}) as Answer, rest, value) : value;
  return { ...answer, [head]: child };
}
const ids = (options?: Opt[]) => new Set((options ?? []).map(o => o.id));
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The cleaned value for a field, or undefined when it is empty or invalid. Unknown ids and duplicates are dropped. */
export function fieldValue(field: Field, raw: unknown): unknown {
  if (field.kind === "single") return typeof raw === "string" && ids(field.options).has(raw) ? raw : undefined;
  if (field.kind === "text") return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, field.max ?? 500) : undefined;
  if (field.kind === "multi") { const ok = ids(field.options), v = [...new Set(arr(raw))].filter(x => ok.has(x)).slice(0, field.max ?? 99); return v.length ? v : undefined; }
  if (field.kind === "order") { const ok = ids(field.options), v = arr(raw); return v.length === ok.size && new Set(v).size === v.length && v.every(x => ok.has(x)) ? v : undefined; }
  // keyed: { [key]: string[] }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const keys = ids(field.keys), recs = ids(field.options), out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!keys.has(k) || DANGEROUS.has(k)) continue;
    const list = [...new Set(arr(v))].filter(x => recs.has(x)).slice(0, field.max ?? 4);
    if (list.length) out[k] = list;
  }
  return Object.keys(out).length && Object.keys(out).length <= (field.maxKeys ?? 2) ? out : undefined;
}
/** Builds the exact submit payload from the (possibly partial) working answer. Incomplete required fields are simply absent. */
export function buildAnswer(fields: Field[], working: Answer): Answer {
  let out: Answer = {};
  for (const f of fields) { const v = fieldValue(f, getAt(working, f.path)); if (v !== undefined) out = setAt(out, f.path, v); }
  return out;
}
/** UX-only readiness check (the server stays authoritative). Returns the labels of fields still needing input. */
export function missingFields(fields: Field[], working: Answer): string[] {
  return fields.filter(f => {
    if (f.optional) return false;
    const v = fieldValue(f, getAt(working, f.path));
    if (v === undefined) return true;
    if (f.kind === "multi" && (v as string[]).length < (f.min ?? 1)) return true;
    return false;
  }).map(f => f.label);
}
/** Draft payload: the cleaned partial answer. Same shape as an answer, so a draft can be loaded straight back into the form. */
export const draftOf = (fields: Field[], working: Answer): Answer => buildAnswer(fields, working);
export const DRAFT_LIMIT_BYTES = 8192;
export const draftBytes = (a: Answer) => new TextEncoder().encode(JSON.stringify(a)).length;
