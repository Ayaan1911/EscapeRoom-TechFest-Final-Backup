"use client";
import { useState } from "react";

/**
 * Containment systems map. Presentation only.
 * - The systems and the links between them are the ones the case record itself names (lure -> device -> identity provider -> export; policy exception -> export).
 * - Every state is a LITERAL mirror of what the team has selected in its own plan (the option's own wording). There is no "correct" colouring and nothing
 *   here evaluates the plan: a map that graded the plan would be a free oracle around the attempt limits.
 */
export type PlanItem = { id: string; title: string };
type NodeId = "mail" | "device" | "idp" | "export" | "evidence" | "lead" | "admin" | "work";
const NODES: { id: NodeId; label: string; x: number; y: number; record: (c: { account: string; sessionId: string; checkpoint: string }) => string[] }[] = [
  { id: "mail", label: "Mail gateway", x: 2, y: 8, record: () => ["The lure was delivered to the mailbox and its link was followed (Chapter 1)."] },
  { id: "device", label: "Employee device", x: 27, y: 8, record: c => [`Browser session first used on a changed device/source for ${c.account}.`] },
  { id: "idp", label: "Identity provider", x: 52, y: 8, record: c => [`Account ${c.account}`, `Session ${c.sessionId}`, "Existing session accepted without fresh MFA."] },
  { id: "export", label: "Customer export service", x: 77, y: 8, record: () => ["customer_directory export recorded.", "Data is already exfiltrated."] },
  { id: "evidence", label: "Evidence store", x: 2, y: 64, record: () => ["Authentication, database and policy audit records; retained capture and message references."] },
  { id: "lead", label: "Incident lead / data owner", x: 27, y: 64, record: c => [`Receives the sealed chronology at the ${c.checkpoint.slice(11, 16)} UTC checkpoint.`] },
  { id: "admin", label: "Admin console", x: 52, y: 64, record: () => ["An administrator command opened an export exception (policy change)."] },
  { id: "work", label: "Support and archive jobs", x: 77, y: 64, record: () => ["Approved archive/maintenance exports and support read paths run on this service."] },
];
const EDGES: [NodeId, NodeId, string][] = [["mail", "device", "lure followed"], ["device", "idp", "session replayed"], ["idp", "export", "export"], ["admin", "export", "policy exception"]];
const EFFECTS: [RegExp, NodeId, string][] = [
  [/^Revoke the affected replay session/, "idp", "Replay session and derived tokens revoked"], [/^Temporarily restrict the affected customer export/, "export", "Customer export gated for the affected identity"],
  [/^Preserve an immutable incident evidence/, "evidence", "Immutable evidence set copied and held"], [/^Notify the internal incident lead/, "lead", "Incident lead and data owner notified (simulated)"],
  [/^Reset only the victim password/, "idp", "Victim password reset; nothing else changed"], [/^Block only the observed source/, "idp", "Observed source address blocked; nothing else changed"],
  [/^Pause every business workload/, "work", "Every support and archive job paused"], [/^Restart the whole fleet/, "evidence", "Whole fleet restarted"],
  [/^Purge incident logs/, "evidence", "Incident logs purged"], [/^Adopt an unverified AI remediation/, "lead", "Generated remediation summary adopted as authorization"],
  [/^Close the unauthorized existing-session exception/, "admin", "Export exception closed; device attestation required"], [/^Verify identity, device trust/, "lead", "Identity and device verified out of band"],
  [/^Replace the affected session/, "idp", "Session and refresh material replaced on the verified device"], [/^Verify the containment barrier/, "idp", "Containment barrier checked (simulated)"],
  [/^Restore the minimum required export/, "export", "Minimum export privilege restored"], [/^Monitor and verify the restored service/, "work", "Post-restoration monitoring and continuity check"],
  [/^Restore using the old browser session/, "idp", "Old browser session reused"], [/^Delete the sealed evidence set/, "evidence", "Sealed evidence set deleted"],
  [/^Rotate all company keys/, "work", "All company keys rotated; unrelated jobs stopped"],
];
const W = 21, H = 28, SY = 0.44; // node box size in % of the map

export function ResponseMap({ account, sessionId, checkpoint, immediate, recovery }: { account: string; sessionId: string; checkpoint: string; immediate: PlanItem[]; recovery: PlanItem[] }) {
  const [sel, setSel] = useState<NodeId>("idp");
  const touches = (id: NodeId) => [...immediate.map(p => ({ ...p, phase: "Urgent" })), ...recovery.map(p => ({ ...p, phase: "Recovery" }))].flatMap(p => EFFECTS.filter(([re, n]) => n === id && re.test(p.title)).map(([, , text]) => `${p.phase}: ${text}`));
  const node = NODES.find(n => n.id === sel)!, c = { account, sessionId, checkpoint }, mine = touches(sel);
  const box = (id: NodeId) => NODES.find(x => x.id === id)!, sy = SY; // SVG units: x in %, y in % of the map height scaled to the 100x44 viewBox
  const out = (a: NodeId, b: NodeId) => { const A = box(a), B = box(b); return A.y === B.y ? { x: A.x + W, y: (A.y + H / 2) * sy } : { x: A.x + W, y: A.y * sy }; };
  const into = (a: NodeId, b: NodeId) => { const A = box(a), B = box(b); return A.y === B.y ? { x: B.x - 0.6, y: (B.y + H / 2) * sy } : { x: B.x + 2, y: (B.y + H) * sy + 0.6 }; };
  return <section className="rm" aria-label="Systems map">
    <div className="rm-map">
      <svg viewBox="0 0 100 44" aria-hidden="true"><defs><marker id="rm-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="rgba(94,201,216,.8)" /></marker></defs>
        {EDGES.map(([a, b]) => { const p = out(a, b), q = into(a, b); return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} markerEnd="url(#rm-arrow)" />; })}</svg>
      {NODES.map(n => { const t = touches(n.id), hot = n.id === "idp" || n.id === "export" || n.id === "admin";
        return <button key={n.id} type="button" className={`rm-node ${hot ? "is-incident" : ""} ${t.length ? "is-touched" : ""} ${sel === n.id ? "is-sel" : ""}`} style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${W}%`, height: `${H}%` }} aria-pressed={sel === n.id} onClick={() => setSel(n.id)}>
          <strong>{n.label}</strong><small>{t.length ? `${t.length} change${t.length > 1 ? "s" : ""} in your plan` : hot ? "Part of the incident" : "Nothing planned"}</small></button>; })}
    </div>
    <p className="rm-cap">Case path: the lure is followed, the stolen session is replayed on a changed device, and customer data is exported. A policy exception opened the export.</p>
    <div className="rm-detail" role="status" aria-live="polite"><h3>{node.label}</h3>
      <p className="rm-sub">From the case record</p><ul>{node.record(c).map(x => <li key={x}>{x}</li>)}</ul>
      <p className="rm-sub">In your plan</p>{mine.length ? <ul>{mine.map(x => <li key={x}>{x}</li>)}</ul> : <p className="k-muted">Nothing in your plan touches this system.</p>}</div>
  </section>;
}
