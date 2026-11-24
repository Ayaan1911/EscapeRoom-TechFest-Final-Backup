"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { I2, KConn, TerminalState } from "@/lib/round2/paper/types";
import { PaperNote } from "./paper-note";
import { attemptsLabel, BANNER as BANNER_TEXT, HELP_LINES, MSG, PROMPT } from "@/lib/round2/paper/killswitch-text";

// Kill Switch (Round 2, Inject 2): connection map + table + inspector + IT ticket log + simulated NEXUS SOC terminal.
// Evidence is neutral; a row only changes appearance after the team itself has blocked it (the server tells us the outcome).
type Line = { kind: "ok" | "bad" | "warn" | "info" | "fail" | "in" | "sys" | "wait"; text: string; fresh?: boolean };
type Outcome = Record<string, "caught" | "cleared">;
const BANNER: Line[] = BANNER_TEXT.map((text, i) => ({ kind: i < 2 ? "sys" as const : "info" as const, text }));
const HELP: Line[] = HELP_LINES.map(text => ({ kind: "info" as const, text }));
const CLOSING = { contained: [{ kind: "ok" as const, text: MSG.contained }], exhausted: [{ kind: "fail" as const, text: MSG.exhausted }] };
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------------- map ---------------- */
const mb = (v: string) => { const m = /([\d.]+)\s*(GB|MB|KB)/.exec(v); return m ? Number(m[1]) * (m[2] === "GB" ? 1024 : m[2] === "KB" ? 1 / 1024 : 1) : 0; };
const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return (h < 12 ? h + 24 : h) * 60 + m; }; // minutes on the night clock
const SNAP = clock("02:50"), NIGHT = clock("21:00");
/** Minutes active up to the 02:50 snapshot, read from the public "Time" column. */
export function activeMinutes(time: string) {
  if (/all night/i.test(time)) return SNAP - NIGHT;
  const m = time.match(/\d{2}:\d{2}/g) ?? []; if (!m.length) return 0;
  const a = clock(m[0] ?? "21:00"), b = /now/i.test(time) ? SNAP : m[1] ? clock(m[1]) : a + 1;
  return Math.max(1, b - a);
}
function KMap({ conns, sel, onSelect, outcome }: { conns: KConn[]; sel: number | null; onSelect: (n: number) => void; outcome: Outcome }) {
  const maxSent = Math.max(1, ...conns.map(k => mb(k.sent))), maxActive = Math.max(1, ...conns.map(k => activeMinutes(k.time)));
  const pos = (i: number) => { const a = (-90 + (i * 360) / conns.length) * Math.PI / 180; return { x: 50 + 38 * Math.cos(a), y: 29 + 21 * Math.sin(a) }; };
  return <figure className="ks-map"><svg viewBox="0 0 100 58" role="group" aria-label="Connection map. Select a connection to inspect it.">
    {conns.map((k, i) => { const q = pos(i); return <line key={`l${k.n}`} x1="50" y1="29" x2={q.x} y2={q.y} strokeWidth={0.2 + 1.1 * (activeMinutes(k.time) / maxActive)} className={`${sel === k.n ? "is-sel" : ""} ${outcome[k.ip] ? "is-cut" : ""}`} />; })}
    <g className="ks-hub" aria-hidden="true"><circle cx="50" cy="29" r="6.2" /><text x="50" y="28.6" textAnchor="middle">NEXUS</text><text x="50" y="31.6" textAnchor="middle">02:50</text></g>
    {conns.map((k, i) => { const q = pos(i), r = 2 + 3.2 * Math.sqrt(mb(k.sent) / maxSent), o = outcome[k.ip];
      return <g key={k.n} className={`ks-node ${sel === k.n ? "is-sel" : ""} ${o ? `is-${o}` : ""}`} role="button" tabIndex={0} aria-pressed={sel === k.n} aria-label={`Connection ${k.n}, ${k.ip}, ${k.process}${o ? (o === "caught" ? ", blocked: threat contained" : ", blocked: legitimate service") : ""}`}
        onClick={() => onSelect(k.n)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(k.n); } }}>
        <circle cx={q.x} cy={q.y} r={r + 1.8} className="ks-hit" /><circle cx={q.x} cy={q.y} r={r} /><text x={q.x} y={q.y + 1} textAnchor="middle">{k.n}</text>{o && <text x={q.x + r + 0.6} y={q.y - r + 0.6} className="ks-mark">{o === "caught" ? "✓" : "✕"}</text>}</g>; })}
  </svg><figcaption>Node size = data sent · line weight = time active up to 02:50 · numbers match the table · ✓ / ✕ appear only after your own BLOCK</figcaption></figure>;
}

/* ---------------- terminal ---------------- */
function Typed({ text, fresh }: { text: string; fresh?: boolean }) {
  const [n, setN] = useState(fresh && !reduced() ? 0 : text.length), ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (n >= text.length) return; const id = setTimeout(() => setN(x => Math.min(text.length, x + 2)), 12); return () => clearTimeout(id); }, [n, text]);
  useEffect(() => { const log = ref.current?.closest(".ks-log"); if (log) log.scrollTop = log.scrollHeight; }, [n]); // keep the newest output in view while it types
  return <span ref={ref}>{text.slice(0, n)}</span>;
}
function linesFromState(st: TerminalState): Line[] {
  const out: Line[] = st.attempts.flatMap(a => [{ kind: "in" as const, text: `BLOCK ${a.ip}` }, { kind: a.result === "caught" ? "ok" as const : "bad" as const, text: a.message }]);
  return [...out, ...(st.lockReason === "contained" ? CLOSING.contained : st.lockReason === "exhausted" ? CLOSING.exhausted : [])];
}
export function Terminal({ demo, maxAttempts, insert, onState, ips }: { demo?: boolean; maxAttempts: number; insert: { ip: string; nonce: number } | null; onState: (st: TerminalState) => void; ips: readonly string[] }) {
  const empty: TerminalState = { open: true, max: maxAttempts, remaining: maxAttempts, locked: false, lockReason: "none", contained: 0, attempts: [] };
  const [st, setSt] = useState<TerminalState>(empty), [lines, setLines] = useState<Line[]>([]), [cmd, setCmd] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(!!demo), [flash, setFlash] = useState("");
  const input = useRef<HTMLInputElement>(null), log = useRef<HTMLOListElement>(null);
  const apply = (s: TerminalState) => { setSt(s); onState(s); };
  useEffect(() => { if (demo) return; let alive = true;
    fetch("/api/round2/terminal", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then((s: TerminalState | null) => { if (!alive) return; if (s) { setSt(s); onState(s); setLines(linesFromState(s)); } setLoaded(true); }).catch(() => setLoaded(true));
    return () => { alive = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);
  useEffect(() => { if (!insert) return; const t = setTimeout(() => { setCmd(`BLOCK ${insert.ip}`); input.current?.focus(); }, 0); return () => clearTimeout(t); }, [insert]);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [lines]);
  const push = (...l: Line[]) => setLines(x => [...x.map(y => ({ ...y, fresh: false })), ...l.map(y => ({ ...y, fresh: true }))]);
  const pulse = (k: string) => { setFlash(k); setTimeout(() => setFlash(""), 520); };

  async function submit(e: FormEvent) {
    e.preventDefault(); const line = cmd.trim(); if (!line || busy) return;
    setCmd("");
    if (/^help$/i.test(line)) { push({ kind: "in", text: line }, ...HELP); return; }
    if (/^clear$/i.test(line)) { setLines([]); return; } // screen only: attempts and history stay on the server
    if (st.locked) { push({ kind: "in", text: line }, { kind: "warn", text: MSG.locked }); return; }
    const m = /^\s*block\s+(\S+)\s*$/i.exec(line);
    push({ kind: "in", text: line });
    setBusy(true);
    const started = performance.now(), wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const real = !!m && ips.includes(m[1]) && !st.attempts.some(a => a.ip === m[1]); // BLOCKING... only for a monitored IP not blocked before
      if (real) push({ kind: "wait", text: `BLOCKING ${m![1]}` });
      // The request goes out immediately; the ~1 s "BLOCKING…" pause is presentation only and never delays recording.
      let body: { state?: TerminalState; lines?: Line[]; error?: string; used?: boolean; result?: string | null };
      if (demo) {
        const parts = line.trim().split(/\s+/);
        body = parts[0].toLowerCase() !== "block" || parts.length !== 2
          ? { lines: [{ kind: "warn", text: parts[0].toLowerCase() !== "block" ? MSG.unknown : parts.length === 1 ? MSG.missing : MSG.tooMany }] }
          : await fetch("/api/round2/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "demo-block", ip: parts[1], previous: st.attempts.map(a => a.ip) }) }).then(r => r.json());
        if (body.result) { // demo: keep the history in this tab only
          const attempts = [...st.attempts, { seq: st.attempts.length + 1, ip: parts[1], result: body.result as "caught" | "cleared", message: body.lines?.[0]?.text ?? "", at: new Date().toISOString() }];
          const contained = attempts.filter(a => a.result === "caught").length, remaining = st.max - attempts.length;
          const lockReason = (body.lines ?? []).some(l => /Both threats contained/.test(l.text)) ? "contained" : remaining === 0 ? "exhausted" : "none";
          body.state = { ...st, attempts, contained, remaining, lockReason, locked: lockReason !== "none" };
        }
      } else {
        const r = await fetch("/api/round2/terminal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: line }) });
        body = await r.json(); if (!r.ok && !body.lines) body.lines = [{ kind: "warn", text: body.error ?? "Command refused. No attempt was used." }];
      }
      if (real) { const left = 950 - (performance.now() - started); if (left > 0 && !reduced()) await wait(left); }
      setLines(x => x.filter(y => y.kind !== "wait"));
      if (body.state) apply(body.state);
      push(...(body.lines ?? []));
      const first = body.lines?.[0]?.kind; if (first === "ok") pulse("ok"); else if (first === "bad") pulse("bad");
    } catch { // the answer was lost: the server may or may not have recorded the block, so never retry blindly. Ask it.
      setLines(x => x.filter(y => y.kind !== "wait"));
      try {
        const r = await fetch("/api/round2/terminal", { cache: "no-store" }); if (!r.ok) throw new Error();
        const s: TerminalState = await r.json(); apply(s); setLines([...linesFromState(s), { kind: "warn", text: "Connection interrupted. The terminal was reloaded from the server: the history above is what was recorded.", fresh: true }]);
      } catch { push({ kind: "warn", text: "Connection lost. Do not retype the command: reload this page to see what the server recorded." }); }
    }
    finally { setBusy(false); setTimeout(() => input.current?.focus(), 0); }
  }
  const level = st.locked ? "locked" : st.remaining >= 3 ? "ok" : st.remaining === 2 ? "warn" : "bad";
  return <section className={`ks-term ${flash ? `flash-${flash}` : ""} ${st.locked ? "is-locked" : ""}`} aria-label="Kill Switch terminal">
    <header className="ks-bar"><span className="ks-dots" aria-hidden="true"><i /><i /><i /></span><b>NEXUS SOC TERMINAL v2.1</b>
      <span className={`ks-att is-${level}`} role="img" aria-label={`${st.remaining} of ${st.max} attempts left`}>{Array.from({ length: st.max }, (_, i) => <i key={i} className={i < st.remaining ? "is-left" : ""} />)}<em>{attemptsLabel(st.remaining, st.max)}</em></span></header>
    {st.lockReason === "contained" && <p className="ks-banner is-ok" role="status">THREATS CONTAINED · terminal locked · write the IPs on your answer sheet</p>}
    {st.lockReason === "exhausted" && <p className="ks-banner is-bad" role="status">OUT OF ATTEMPTS · terminal locked · call a volunteer</p>}
    {st.lockReason === "closed" && !demo && <p className="ks-banner is-warn" role="status">ROUND 2 IS NOT RUNNING · terminal locked</p>}
    {st.lockReason === "no-key" && !demo && loaded && <p className="ks-banner is-warn" role="status">TERMINAL OFFLINE · awaiting the organizer&apos;s approved answer set · write your findings on paper</p>}
    <ol className="ks-log" ref={log} aria-live="polite" aria-label="Terminal output">
      {BANNER.map((l, i) => <li key={`b${i}`} className={`is-${l.kind}`}>{l.text}</li>)}
      {lines.map((l, i) => <li key={i} className={`is-${l.kind}`}>{l.kind === "in" ? <><span className="ks-prompt">{PROMPT}</span> {l.text}</> : l.kind === "wait" ? <>{l.text}<span className="ks-dotsanim" aria-hidden="true">...</span></> : <Typed text={l.text} fresh={l.fresh} />}</li>)}
    </ol>
    <form onSubmit={submit} className="ks-cmd"><label htmlFor="ks-cmd-input" className="ks-prompt">{PROMPT}</label>
      <span className="ks-field">{!cmd && !busy && <span className="ks-cursor" aria-hidden="true" />}<input id="ks-cmd-input" ref={input} value={cmd} onChange={e => setCmd(e.target.value)} disabled={busy || !loaded} maxLength={120} autoComplete="off" spellCheck={false} aria-label="Terminal command" placeholder={st.locked ? "locked · help / clear" : "BLOCK <ip address>"} /></span>
      <button type="submit" disabled={busy || !cmd.trim()}>Enter</button></form>
    {demo && <button type="button" className="ks-reset" onClick={() => { apply(empty); setLines([]); }}>Reset demo terminal</button>}
  </section>;
}

/* ---------------- page ---------------- */
export function Inject2({ c, demo }: { c: I2; demo?: boolean }) {
  const [sel, setSel] = useState<number | null>(null), [insert, setInsert] = useState<{ ip: string; nonce: number } | null>(null), [tickets, setTickets] = useState(false);
  const [st, setSt] = useState<TerminalState | null>(null), k = c.connections.find(x => x.n === sel);
  const outcome: Outcome = Object.fromEntries((st?.attempts ?? []).map(a => [a.ip, a.result]));
  const ticketOf = (id: string) => c.tickets.find(t => t.id === id);
  const openTicket = (id: string) => { setTickets(true); setTimeout(() => document.getElementById(`ks-${id}`)?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 30); };
  return <div className="ij ij-2 ks">
    <section className="ks-status" aria-label="Incident status">
      <div><small>SNAPSHOT</small><b>{c.snapshot}</b></div>
      <div className="ks-obj"><small>OBJECTIVE</small><span>{c.brief}</span></div>
      <div><small>ATTEMPTS</small><b>{st ? `${st.remaining} / ${st.max}` : `${c.maxAttempts} / ${c.maxAttempts}`}</b></div>
      <div><small>CONTAINED</small><b>{st?.contained ?? 0}</b></div>
      <p className="ks-paper"><span aria-hidden="true">✎</span> The terminal is not your answer: write the IPs, your evidence and your reasoning on paper.</p>
    </section>
    <div className="ij-cols ij-cols-2">
      <div className="ij-stack">
        <KMap conns={c.connections} sel={sel} onSelect={n => setSel(n)} outcome={outcome} />
        <section className="ij-panel ks-tablewrap" aria-label="Live connections"><table className="ij-table ks-conns"><thead><tr><th scope="col">#</th><th scope="col">IP address</th><th scope="col">Process</th><th scope="col">Country</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Time</th></tr></thead>
          <tbody>{c.connections.map(x => <tr key={x.n} className={`${sel === x.n ? "is-sel" : ""} ${outcome[x.ip] ? `is-${outcome[x.ip]}` : ""}`} onClick={() => setSel(x.n)}><td>{x.n}</td><td className="ij-mono"><button type="button" className="ks-rowbtn" aria-pressed={sel === x.n} onClick={e => { e.stopPropagation(); setSel(x.n); }}>{x.ip}<span className="rp-sr"> inspect connection {x.n}</span></button></td><td className="ij-mono">{x.process}</td><td>{x.country}</td><td>{x.sent}</td><td>{x.received}</td><td className="ij-mono">{x.time}</td></tr>)}</tbody></table></section>
        <section className="ij-panel ks-tickets" aria-label="IT ticket log"><button type="button" className="ks-toggle" aria-expanded={tickets} onClick={() => setTickets(t => !t)}><b>IT ticket log</b><span>{c.tickets.length} tickets · {tickets ? "hide" : "show"}</span></button>
          {tickets && <><ol className="ks-ticketlist">{c.tickets.map(t => <li key={t.id} id={`ks-${t.id}`} className={k?.ticket === t.id ? "is-sel" : ""}><header><b className="ij-mono">{t.id}</b><em>{t.status}</em></header><p className="ks-tk-text">{t.text}</p><small>Created: {t.created}</small></li>)}</ol><p className="ij-note">{c.ticketFooter}</p></>}</section>
      </div>
      <div className="ij-stack ij-sticky">
        {k ? <section className="ij-panel ks-inspect" aria-label={`Inspect connection ${k.n}`}><h3>Inspect · connection {k.n}</h3>
          <dl className="ij-dl"><div><dt>IP address</dt><dd className="ij-mono">{k.ip}</dd></div><div><dt>Process</dt><dd className="ij-mono">{k.process}</dd></div><div><dt>Country</dt><dd>{k.country}</dd></div><div><dt>Sent / received</dt><dd>{k.sent} / {k.received}</dd></div><div><dt>Time</dt><dd>{k.time}</dd></div>
            <div><dt>Ticket</dt><dd>{ticketOf(k.ticket) ? <button type="button" className="ij-link" onClick={() => openTicket(k.ticket)}>{k.ticket} · open in ticket log</button> : k.ticket}</dd></div></dl>
          <p className="ks-desc">{k.description}</p>
          <button type="button" className="ij-btn" onClick={() => setInsert({ ip: k.ip, nonce: Date.now() })}>Copy IP into the terminal <span className="ij-sub">(does not run it)</span></button></section>
          : <p className="ij-panel ij-empty">Select a connection on the map or in the table to inspect it.</p>}
        <Terminal demo={demo} maxAttempts={c.maxAttempts} insert={insert} onState={setSt} ips={c.connections.map(x => x.ip)} />
        <PaperNote items={c.paper} />
      </div>
    </div>
  </div>;
}
