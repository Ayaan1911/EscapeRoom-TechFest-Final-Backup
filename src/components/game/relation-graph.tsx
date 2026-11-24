"use client";
import { useState } from "react";

type Staff = { id: string; name: string; role: string };
type Kind = { key: string; label: string };
/** Who appears in which kind of record, drawn from the case's own dossier counts. A line means "appears in at least one such record";
 *  it never says who is guilty. Focus model: lines stay faint until a person or a record type is chosen, then only its links light up
 *  (with the record count) and the inspector lists them with a button to open those records. */
export function RelationGraph({ staff, kinds, count, selectedStaff, selectedKind, onStaff, onKind, onCell }: { staff: Staff[]; kinds: Kind[]; count: (staffId: string, kind: string) => number; selectedStaff: string; selectedKind: string; onStaff: (id: string) => void; onKind: (key: string) => void; onCell: (staffId: string, kind: string) => void }) {
  const [hover, setHover] = useState("");
  const sy = (i: number) => 10 + (i * 40) / Math.max(1, staff.length - 1), ky = (i: number) => 10 + (i * 40) / Math.max(1, kinds.length - 1);
  const edges = staff.flatMap((p, i) => kinds.map((k, j) => ({ p, k, i, j, n: count(p.id, k.key) }))).filter(e => e.n > 0);
  const focusStaff = selectedStaff || (hover.startsWith("s:") ? hover.slice(2) : ""), focusKind = selectedKind || (hover.startsWith("k:") ? hover.slice(2) : "");
  const lit = (e: (typeof edges)[number]) => (focusStaff && e.p.id === focusStaff) || (focusKind && e.k.key === focusKind);
  const quiet = !focusStaff && !focusKind;
  const person = staff.find(p => p.id === selectedStaff), kind = kinds.find(k => k.key === selectedKind);
  const key = (fn: () => void) => (ev: React.KeyboardEvent) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fn(); } };
  return <div className="cn-relwrap">
    <svg className={`cn-rel ${quiet ? "is-quiet" : ""}`} viewBox="0 6 120 48" role="group" aria-label="Relationship board: staff on the left, record types on the right. Select one to focus its links.">
      {edges.map(e => { const id = e.p.id + e.k.key, x1 = 38, x2 = 82, y1 = sy(e.i), y2 = ky(e.j), d = `M${x1} ${y1} C ${x1 + 22} ${y1}, ${x2 - 22} ${y2}, ${x2} ${y2}`, on = lit(e);
        const label = `${e.p.name}: ${e.n} ${e.k.label} record${e.n > 1 ? "s" : ""}. Open them.`;
        return <g key={id} className={`cn-edge ${on ? "is-on" : ""}`} role="button" tabIndex={0} aria-label={label} onClick={() => onCell(e.p.id, e.k.key)} onKeyDown={key(() => onCell(e.p.id, e.k.key))}>
          <path className="hit" d={d} /><path className="ln" d={d} style={{ strokeWidth: 0.25 + 0.22 * e.n }} />{on && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 1} className="n">{e.n}</text>}</g>; })}
      {staff.map((p, i) => <g key={p.id} className={`cn-nd ${selectedStaff === p.id ? "is-sel" : ""}`} role="button" tabIndex={0} aria-pressed={selectedStaff === p.id} aria-label={`Focus ${p.name}`}
        onClick={() => onStaff(selectedStaff === p.id ? "" : p.id)} onKeyDown={key(() => onStaff(selectedStaff === p.id ? "" : p.id))} onMouseEnter={() => setHover(`s:${p.id}`)} onMouseLeave={() => setHover("")}>
        <circle cx="38" cy={sy(i)} r="2.4" /><text x="34" y={sy(i) - .2} className="nm" textAnchor="end">{p.name}</text><text x="34" y={sy(i) + 2.6} className="sb" textAnchor="end">{p.role}</text></g>)}
      {kinds.map((k, j) => <g key={k.key} className={`cn-nd cn-kd ${selectedKind === k.key ? "is-sel" : ""}`} role="button" tabIndex={0} aria-pressed={selectedKind === k.key} aria-label={`Focus record type ${k.label}`}
        onClick={() => onKind(selectedKind === k.key ? "" : k.key)} onKeyDown={key(() => onKind(selectedKind === k.key ? "" : k.key))} onMouseEnter={() => setHover(`k:${k.key}`)} onMouseLeave={() => setHover("")}>
        <rect x="82" y={ky(j) - 2.4} width="4.8" height="4.8" rx=".8" /><text x="90" y={ky(j) + 1} className="nm">{k.label}</text></g>)}
    </svg>
    <aside className="cn-relinspect" aria-live="polite" aria-label="Link inspector">
      {person ? <><b>{person.name}</b><small>{person.role}</small><ul>{kinds.map(k => { const n = count(person.id, k.key); return <li key={k.key} className={n ? "" : "is-none"}><span>{k.label}</span>{n ? <button type="button" className="k-btn k-btn-sm" onClick={() => onCell(person.id, k.key)}>Open {n}</button> : <em>none</em>}</li>; })}</ul></>
        : kind ? <><b>{kind.label} records</b><small>who appears in them</small><ul>{staff.map(p => { const n = count(p.id, kind.key); return <li key={p.id} className={n ? "" : "is-none"}><span>{p.name}</span>{n ? <button type="button" className="k-btn k-btn-sm" onClick={() => onCell(p.id, kind.key)}>Open {n}</button> : <em>none</em>}</li>; })}</ul></>
        : <p>Select a <b>person</b> (left) or a <b>record type</b> (right) to light up its links. A line means &ldquo;appears in at least one record of that type&rdquo;; thicker = more records. It is not a verdict.</p>}
    </aside>
  </div>;
}
