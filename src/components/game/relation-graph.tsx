"use client";
import { useState } from "react";

type Staff = { id: string; name: string; role: string };
type Kind = { key: string; label: string };
/** Who appears in which kind of record, drawn from the case's own dossier counts. A line means "appears in at least one such record"; it never says who is guilty. */
export function RelationGraph({ staff, kinds, count, selectedStaff, selectedKind, onStaff, onCell }: { staff: Staff[]; kinds: Kind[]; count: (staffId: string, kind: string) => number; selectedStaff: string; selectedKind: string; onStaff: (id: string) => void; onCell: (staffId: string, kind: string) => void }) {
  const [hover, setHover] = useState("");
  const sy = (i: number) => 10 + (i * 40) / Math.max(1, staff.length - 1), ky = (i: number) => 10 + (i * 40) / Math.max(1, kinds.length - 1);
  const edges = staff.flatMap((p, i) => kinds.map((k, j) => ({ p, k, i, j, n: count(p.id, k.key) }))).filter(e => e.n > 0);
  const focus = (e: (typeof edges)[number]) => (selectedStaff && e.p.id === selectedStaff) || (selectedKind && e.k.key === selectedKind) || hover === e.p.id + e.k.key;
  const anyFocus = !!selectedStaff || !!selectedKind;
  return <svg className="cn-rel" viewBox="0 6 120 48" role="group" aria-label="Relationship board: staff on the left, record types on the right">
    {edges.map(e => { const id = e.p.id + e.k.key, x1 = 38, x2 = 82, y1 = sy(e.i), y2 = ky(e.j), d = `M${x1} ${y1} C ${x1 + 22} ${y1}, ${x2 - 22} ${y2}, ${x2} ${y2}`, on = focus(e);
      const label = `${e.p.name}: ${e.n} ${e.k.label} record${e.n > 1 ? "s" : ""}. Open them.`;
      return <g key={id} className={`cn-edge ${on ? "is-on" : anyFocus ? "is-dim" : ""}`} role="button" tabIndex={0} aria-label={label} onClick={() => onCell(e.p.id, e.k.key)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onCell(e.p.id, e.k.key); } }} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover("")} onFocus={() => setHover(id)} onBlur={() => setHover("")}>
        <path className="hit" d={d} /><path className="ln" d={d} style={{ strokeWidth: 0.25 + 0.22 * e.n }} />{on && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 1} className="n">{e.n}</text>}</g>; })}
    {staff.map((p, i) => <g key={p.id} className={`cn-nd ${selectedStaff === p.id ? "is-sel" : ""}`} role="button" tabIndex={0} aria-pressed={selectedStaff === p.id} aria-label={`Filter board to ${p.name}`} onClick={() => onStaff(selectedStaff === p.id ? "" : p.id)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onStaff(selectedStaff === p.id ? "" : p.id); } }}>
      <circle cx="38" cy={sy(i)} r="2.4" /><text x="34" y={sy(i) - .2} className="nm" textAnchor="end">{p.name}</text><text x="34" y={sy(i) + 2.6} className="sb" textAnchor="end">{p.role}</text></g>)}
    {kinds.map((k, j) => <g key={k.key} className={`cn-nd cn-kd ${selectedKind === k.key ? "is-sel" : ""}`} aria-hidden="true"><rect x="82" y={ky(j) - 2.4} width="4.8" height="4.8" rx=".8" /><text x="90" y={ky(j) + 1} className="nm">{k.label}</text></g>)}
  </svg>;
}
