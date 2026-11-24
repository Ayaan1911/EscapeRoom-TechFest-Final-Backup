"use client";
import { useState } from "react";
import { ConfirmForm } from "@/components/ui/confirm";

// "Confirm Top 10 and Advance to Round 2". The confirmation dialog lists exactly the teams that will advance, including any
// tied-place choice the organizer makes here. The server re-validates everything (ranking, tie group, round state).
export type AdvRow = { id: string; name: string; rank: number; total: number; chapter23: number; hints: number; completedAt: string | null };
// `sure` advance regardless; `rest` is everyone below them in ranking order (the tied group first), used for the standby preview.
type Props = { action: (form: FormData) => void | Promise<void>; sure: AdvRow[]; rest: AdvRow[]; tie: null | { score: number; slots: number; group: AdvRow[] }; disabled: boolean; why?: string };

const when = (iso: string | null) => iso ? `${iso.slice(11, 19)} UTC` : "not complete";
export function AdvanceTop10({ action, sure, rest, tie, disabled, why }: Props) {
  const [chosen, setChosen] = useState<string[]>([]);
  const need = tie?.slots ?? 0, ready = !tie || chosen.length === need;
  const picked = tie ? tie.group.filter(r => chosen.includes(r.id)) : [];
  const advancing = [...sure, ...picked].sort((a, b) => a.rank - b.rank), standby = rest.filter(r => !chosen.includes(r.id)).slice(0, 2);
  const toggle = (id: string) => setChosen(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  return <ConfirmForm action={action} danger title="Confirm Top 10 and advance to Round 2?" confirmLabel="Confirm and advance"
    details={<>
      <p>These {advancing.length} teams will be marked eligible for Round 2 (finalists). It does not start Round 2 and changes no score.</p>
      <ol className="cc-adv-list">{advancing.map(r => <li key={r.id}><b>{r.name}</b> <small>{r.id} · {r.total} points{tie && chosen.includes(r.id) ? " · chosen by the organizer" : ""}</small></li>)}</ol>
      {standby.length > 0 && <p>Standby (not advancing unless promoted later): {standby.map(r => r.name).join(", ")}.</p>}
      {tie && <p><b>Tie decision:</b> {tie.group.length} teams were tied on {tie.score} points for the last {tie.slots} place{tie.slots === 1 ? "" : "s"}. The organizer chose: {picked.map(r => r.name).join(", ")}. This is recorded as a manual decision, not as a tie-break rule.</p>}
      <p>The decision is written to the audit log and cannot be changed from here once recorded.</p></>}>
    {tie && <fieldset className="cc-tie" aria-describedby="tie-help" disabled={disabled}>
      <legend>Tie at 10th place: choose {need} of {tie.group.length}</legend>
      <p id="tie-help" className="cc-note">These teams have exactly {tie.score} points. The system does not break this tie by team ID, order or timestamps: you decide, and the decision is recorded as manual. The columns are information only.</p>
      <table className="cc-table cc-table-mini"><thead><tr><th><span className="sr-only">Advance</span></th><th>Rank</th><th>Team</th><th>Ch 2+3 raw</th><th>Hints</th><th>Completed</th></tr></thead>
        <tbody>{tie.group.map(r => <tr key={r.id}><td><input type="checkbox" name="tie" value={r.id} checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} disabled={!chosen.includes(r.id) && chosen.length >= need} aria-label={`Advance ${r.name}`} /></td>
          <td className="cc-num">{r.rank}</td><td><b>{r.name}</b><small>{r.id}</small></td><td className="cc-num">{r.chapter23}</td><td className="cc-num">{r.hints}</td><td>{when(r.completedAt)}</td></tr>)}</tbody></table>
      <p role="status" className={`cc-tie-count ${ready ? "is-ok" : ""}`}>{chosen.length} of {need} chosen</p>
    </fieldset>}
    <fieldset className="cc-form-row" disabled={disabled}>
      <label>Review reason<input name="reason" required minLength={5} maxLength={500} /></label>
      <label className="review-acknowledgement k-check"><input type="checkbox" name="reviewed" required />I reviewed incomplete investigations, tie-break details and audited overrides.</label>
      <button className="cc-btn cc-btn-primary cc-btn-lg" disabled={!ready}>Confirm Top 10 and Advance to Round 2</button>
      {!ready && <p className="cc-note">Choose exactly {need} tied team{need === 1 ? "" : "s"} to continue.</p>}
      {why && <p className="cc-note">{why}</p>}
    </fieldset>
  </ConfirmForm>;
}
