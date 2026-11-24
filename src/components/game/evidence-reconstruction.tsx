"use client";
import type { FormEvent } from "react";
import { FOLDERS, PAIRS, type PairState } from "@/lib/game/evidence-wall-meta";

// Three-part evidence reconstruction. Nothing here knows which slip fits which card: the participant compares the clues printed on the physical
// pieces, enters one slip code and one wall-card code, and the server answers. Progress is the server's (a refresh never loses a solved pair).
type Props = { pairs: PairState; onMatch: (event: FormEvent<HTMLFormElement>) => void; disabled: boolean; feedback: string; opened: Record<string, number> };
export function EvidenceReconstruction({ pairs, onMatch, disabled, feedback, opened }: Props) {
  const solved = PAIRS.filter(p => pairs[p]).length, done = solved === PAIRS.length;
  return <section className="ew" aria-labelledby="ew-h">
    <header className="ew-head"><div><span className="k-eyebrow">EVIDENCE WALL · RECONSTRUCTION</span><h2 id="ew-h">{done ? "EVIDENCE SET RECONSTRUCTED — 3/3" : `Reconstruct the evidence set — ${solved}/3`}</h2>
      <p>{done ? "All three folders are open. Inspect them below, then work the tasks." : "Your envelope holds private slips. Each one fits exactly one card on the public Evidence Wall. Read the clues on both pieces, then enter the two codes."}</p></div>
      <div className="ew-meter" role="img" aria-label={`${solved} of 3 evidence folders reconstructed`}>{PAIRS.map(p => <i key={p} className={pairs[p] ? "is-on" : ""} />)}</div></header>
    <ol className="ew-slots" aria-label="Evidence folders">{PAIRS.map(p => <li key={p} className={pairs[p] ? "is-open" : "is-sealed"}>
      <span className="ew-slot-n" aria-hidden="true">{pairs[p] ? "✓" : p}</span>
      <div><b>Evidence {p} · {FOLDERS[p].title}</b><small>{pairs[p] ? `Open · ${opened[p] ?? 0} record${opened[p] === 1 ? "" : "s"}` : "Sealed folder"}</small><span>{FOLDERS[p].blurb}</span></div></li>)}</ol>
    {!done && <form className="ew-form" onSubmit={onMatch}>
      <fieldset disabled={disabled}><legend>Match a slip to a wall card</legend>
        <label>Private slip code<input name="privateCode" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="from your envelope" /></label>
        <label>Wall card code<input name="publicCode" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="from the Evidence Wall" /></label>
        <button className="k-btn k-btn-primary">Match fragments</button></fieldset>
      <p className="ew-hint">A wrong pair costs nothing but a short wait. Look for the identifier that appears on both pieces; lookalikes are on the wall on purpose.</p></form>}
    <p role="status" className="pg-live ew-status">{feedback}</p>
  </section>;
}
