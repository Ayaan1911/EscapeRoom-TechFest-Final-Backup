"use client";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { getAt, type Answer, type Field, type Opt } from "@/lib/round2/form-types";
import type { R2Record } from "./types";

// Reusable, typed input controls for every Round 2 task. All evidence text is rendered as plain React text (never as HTML).
export type Evidence = { records: Map<string, R2Record> };
const EvCtx = createContext<Evidence>({ records: new Map() });
export const EvidenceProvider = ({ records, children }: { records: R2Record[]; children: ReactNode }) => <EvCtx.Provider value={{ records: new Map(records.map(r => [r.id, r])) }}>{children}</EvCtx.Provider>;
export const useEvidence = () => useContext(EvCtx);

/** Claims A/B/C of the AI report, parsed from its record text. */
export function claimOf(records: Map<string, R2Record>, letter: string) {
  const text = records.get("AI-REPORT")?.detail ?? "";
  return text.split(/Claim ([ABC]): /).slice(1).reduce<Record<string, string>>((acc, v, i, a) => (i % 2 === 0 ? { ...acc, [v]: (a[i + 1] ?? "").trim() } : acc), {})[letter] ?? "";
}
function Described({ id, text, hint }: { id: string; text?: string; hint?: boolean }) {
  const { records } = useEvidence(), r = records.get(id);
  if (r && (text === undefined || text === id)) return <span className="r2-opt"><span><b className="r2-id">{r.id}</b> {r.title}</span>{hint !== false && <small className="r2-meta">{r.time !== "n/a" && <span className="r2-mono">{r.time}</span>} <span>{r.source}</span></small>}</span>;
  return <span className="r2-opt"><span>{text && text !== id ? <>{text}</> : <b className="r2-id">{id}</b>}</span></span>;
}
export const optionText = (o: Opt) => o.text;

type Common = { disabled: boolean };
function Single({ field, value, onChange, disabled }: Common & { field: Field; value: string | undefined; onChange: (v: string) => void }) {
  const name = useId(), opts = field.options ?? [];
  if (opts.length > 6) return <label className="r2-field"><span className="r2-legend">{field.label}</span>
    <select value={value ?? ""} disabled={disabled} onChange={e => e.target.value && onChange(e.target.value)}><option value="">Choose a record…</option>{opts.map(o => <option key={o.id} value={o.id}>{o.id}{o.text !== o.id ? ` · ${o.text}` : ""}</option>)}</select>
    {value && <Described id={value} hint />}</label>;
  return <fieldset className="r2-field" disabled={disabled}><legend className="r2-legend">{field.label}</legend>
    <div className="r2-choices">{opts.map(o => <label key={o.id} className={`r2-choice ${value === o.id ? "is-picked" : ""}`}><input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} /><Described id={o.id} text={o.text} /></label>)}</div></fieldset>;
}
function Multi({ field, value, onChange, disabled }: Common & { field: Field; value: string[]; onChange: (v: string[]) => void }) {
  const max = field.max ?? 99, full = value.length >= max;
  return <fieldset className="r2-field" disabled={disabled}><legend className="r2-legend">{field.label} <span className="r2-count" aria-live="polite">{value.length}{field.max ? ` / ${field.max}` : ""} selected</span></legend>
    <div className="r2-choices">{(field.options ?? []).map(o => { const on = value.includes(o.id);
      return <label key={o.id} className={`r2-choice ${on ? "is-picked" : ""}`}><input type="checkbox" checked={on} disabled={!on && full} onChange={() => onChange(on ? value.filter(v => v !== o.id) : [...value, o.id])} /><Described id={o.id} text={o.text} /></label>; })}</div></fieldset>;
}
/** Ordering with keyboard-accessible move buttons (drag and drop is an optional extra). The order only counts once the participant sets it. */
function Order({ field, value, onChange, disabled }: Common & { field: Field; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const opts = field.options ?? [], set = value !== undefined, list = set ? value : opts.map(o => o.id);
  const [drag, setDrag] = useState<string | null>(null), [note, setNote] = useState("");
  const move = (id: string, to: number) => { if (to < 0 || to >= list.length) return; const next = list.filter(x => x !== id); next.splice(to, 0, id); onChange(next); setNote(`${id} moved to position ${to + 1} of ${list.length}.`); };
  return <div className="r2-field"><div className="r2-legend">{field.label}</div>
    {!set && <p className="r2-warn" role="status">Not yet ordered. The list below is only the shuffled starting pile. <button type="button" className="k-btn k-btn-sm" disabled={disabled} onClick={() => onChange(list)}>Use this order as my starting point</button></p>}
    <ol className="r2-order" aria-label={field.label}>{list.map((id, i) => { const o = opts.find(x => x.id === id)!;
      return <li key={id} draggable={!disabled} onDragStart={() => setDrag(id)} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag && drag !== id) move(drag, list.indexOf(id)); setDrag(null); }} className={drag === id ? "is-dragging" : ""}>
        <span className="r2-pos" aria-hidden="true">{set ? i + 1 : "·"}</span><Described id={id} text={o.text} />
        <span className="r2-move"><button type="button" className="k-btn k-btn-sm" disabled={disabled || i === 0} aria-label={`Move ${id} up`} onClick={() => move(id, i - 1)}>↑</button><button type="button" className="k-btn k-btn-sm" disabled={disabled || i === list.length - 1} aria-label={`Move ${id} down`} onClick={() => move(id, i + 1)}>↓</button></span></li>; })}</ol>
    <p className="r2-sr" role="status" aria-live="polite">{note}</p></div>;
}
/** Evidence mapped onto up to N connections: pick a connection, then tick the records that prove it. */
function Keyed({ field, value, onChange, disabled }: Common & { field: Field; value: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void }) {
  const [slots, setSlots] = useState<string[]>(() => Object.keys(value)); // local until a record is ticked: empty slots are UI state, not an answer
  const maxKeys = field.maxKeys ?? 2, free = (field.keys ?? []).filter(k => !slots.includes(k.id));
  const toggle = (key: string, rec: string) => { const cur = value[key] ?? [], on = cur.includes(rec), next = on ? cur.filter(x => x !== rec) : [...cur, rec].slice(0, field.max ?? 4); const out = { ...value, [key]: next }; if (!next.length) delete out[key]; onChange(out); };
  const drop = (key: string) => { setSlots(slots.filter(s => s !== key)); const out = { ...value }; delete out[key]; onChange(out); };
  return <div className="r2-field"><div className="r2-legend">{field.label}</div>
    {slots.map(key => <fieldset key={key} className="r2-slot" disabled={disabled}><legend><Described id={key} hint={false} /> <button type="button" className="k-btn k-btn-sm" onClick={() => drop(key)}>Remove</button></legend>
      <div className="r2-choices">{(field.options ?? []).map(o => { const on = (value[key] ?? []).includes(o.id); return <label key={o.id} className={`r2-choice ${on ? "is-picked" : ""}`}><input type="checkbox" checked={on} onChange={() => toggle(key, o.id)} /><Described id={o.id} text={o.text} /></label>; })}</div></fieldset>)}
    {slots.length < maxKeys && <label className="r2-field"><span className="r2-legend">Add a connection to prove ({slots.length}/{maxKeys})</span><select disabled={disabled} value="" onChange={e => e.target.value && setSlots([...slots, e.target.value])}><option value="">Choose a connection…</option>{free.map(k => <option key={k.id} value={k.id}>{k.id}</option>)}</select></label>}</div>;
}
/** Rows of single-choice fields that share the same small option set (classification grids). */
function Grid({ fields, working, onChange, disabled }: Common & { fields: Field[]; working: Answer; onChange: (f: Field, v: unknown) => void }) {
  const { records } = useEvidence(), classes = fields[0].options ?? [];
  return <div className="r2-grid" role="group" aria-label="Classification grid">{fields.map(f => { const v = getAt(working, f.path) as string | undefined, r = f.ref ? records.get(f.ref) : undefined, name = f.path.join("-");
    return <fieldset key={name} className="r2-row" disabled={disabled}><legend><b className="r2-id">{f.ref ?? f.label}</b>{r && <> {r.title} <small className="r2-meta"><span className="r2-mono">{r.time}</span> {r.source}</small></>}</legend>
      {r?.detail && <details><summary>Record details</summary><p>{r.detail}</p></details>}
      <div className="r2-segs">{classes.map(c => <label key={c.id} className={`r2-seg ${v === c.id ? "is-picked" : ""}`}><input type="radio" name={name} checked={v === c.id} onChange={() => onChange(f, c.id)} /><span>{c.text}</span></label>)}</div></fieldset>; })}</div>;
}
const isGridField = (f: Field) => f.kind === "single" && !!f.ref && (f.options?.length ?? 0) <= 3 && !f.ref.startsWith("AI-REPORT") && f.options!.length === 3 && f.options![0].id !== "true";

/** Renders all of a task's fields from its declarative metadata. */
export function TaskFields({ fields, working, onChange, disabled }: { fields: Field[]; working: Answer; onChange: (f: Field, v: unknown) => void; disabled: boolean }) {
  const { records } = useEvidence(), out: ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i], v = getAt(working, f.path);
    if (isGridField(f)) { const group = [f]; while (i + 1 < fields.length && isGridField(fields[i + 1])) group.push(fields[++i]); out.push(<Grid key={f.path.join(".")} fields={group} working={working} onChange={onChange} disabled={disabled} />); continue; }
    const ref = f.ref?.startsWith("AI-REPORT#") ? claimOf(records, f.ref.slice(-1)) : "";
    out.push(<div key={f.path.join(".")} className="r2-fieldwrap">
      {ref && <blockquote className="r2-claim" aria-label={`${f.label} text, untrusted AI output`}><span className="r2-tag r2-tag-ai">AI claim · unverified</span> {ref}</blockquote>}
      {f.kind === "single" && <Single field={f} value={v as string | undefined} disabled={disabled} onChange={x => onChange(f, x)} />}
      {f.kind === "multi" && <Multi field={f} value={(v as string[] | undefined) ?? []} disabled={disabled} onChange={x => onChange(f, x)} />}
      {f.kind === "order" && <Order field={f} value={v as string[] | undefined} disabled={disabled} onChange={x => onChange(f, x)} />}
      {f.kind === "keyed" && <Keyed field={f} value={(v as Record<string, string[]> | undefined) ?? {}} disabled={disabled} onChange={x => onChange(f, x)} />}
      {f.kind === "text" && <label className="r2-field"><span className="r2-legend">{f.label}</span><textarea rows={3} maxLength={f.max} disabled={disabled} value={(v as string | undefined) ?? ""} onChange={e => onChange(f, e.target.value)} /></label>}
    </div>);
  }
  return <>{out}</>;
}
