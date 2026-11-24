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

/** Group mode: ONE assigned group per team. The team's private slip (Group letter printed on it) fits exactly one public wall card; one match opens the whole dossier. */
export function GroupMatch({ group, solved, onMatch, disabled, feedback }: { group: "A" | "B" | "C"; solved: boolean; onMatch: (event: FormEvent<HTMLFormElement>) => void; disabled: boolean; feedback: string }) {
  return <section className="ew ew-group" aria-labelledby="ew-g-h">
    <header className="ew-head"><div><span className="k-eyebrow">EVIDENCE WALL · GROUP {group}</span>
      <h2 id="ew-g-h">{solved ? `GROUP ${group} MATCHED — DOSSIER OPEN` : `Match your Group ${group} fragment`}</h2>
      <p>{solved ? "Your private fragment and its public counterpart fit together. The whole dossier is open below." : `Your envelope holds ONE private fragment, marked Group ${group}. Its matching public card is on the Evidence Wall in the Group ${group} section. Read the clues on both pieces, then enter the two codes.`}</p></div>
      <div className="ew-badge" role="img" aria-label={`Assigned group ${group}${solved ? ", matched" : ""}`}><b>{solved ? "✓" : group}</b><small>GROUP {group}</small></div></header>
    {!solved && <form className="ew-form" onSubmit={onMatch}>
      <fieldset disabled={disabled}><legend>Match your fragment to a wall card</legend>
        <label>Private fragment code<input name="privateCode" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="from your envelope" /></label>
        <label>Wall card code<input name="publicCode" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="from the Evidence Wall" /></label>
        <button className="k-btn k-btn-primary">Match fragments</button></fieldset>
      <p className="ew-hint">The group letter only tells you where to look. Several cards in the section look alike; only the one that fits your fragment works. A wrong pair costs nothing but a short wait.</p></form>}
    <p role="status" className="pg-live ew-status">{feedback}</p>
  </section>;
}
