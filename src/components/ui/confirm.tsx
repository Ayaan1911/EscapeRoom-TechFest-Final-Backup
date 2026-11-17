"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

/**
 * Wraps a server-action form with a confirmation dialog (native <dialog>: focus trap, Esc to cancel).
 * The first submit is intercepted after normal field validation; confirming re-submits the same form with the same button.
 * Optional `typeToConfirm` forces the operator to type a word before the confirm button enables (for irreversible actions).
 */
export function ConfirmForm({ action, title, confirmLabel, typeToConfirm, danger = false, children, details, className }: {
  action: (form: FormData) => void | Promise<void>; title: string; confirmLabel: string; typeToConfirm?: string; danger?: boolean; children: ReactNode; details: ReactNode; className?: string;
}) {
  const form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), pass = useRef(false), submitter = useRef<HTMLElement | null>(null);
  const [typed, setTyped] = useState("");
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  function intercept(event: FormEvent<HTMLFormElement>) {
    if (pass.current) { pass.current = false; return; }
    event.preventDefault();
    submitter.current = (event.nativeEvent as SubmitEvent).submitter;
    setTyped(""); dialog.current?.showModal();
  }
  function confirm() {
    if (!ok) return;
    pass.current = true; dialog.current?.close();
    form.current?.requestSubmit(submitter.current as HTMLButtonElement | null);
  }
  return <>
    <form ref={form} action={action} onSubmit={intercept} className={className}>{children}</form>
    <dialog ref={dialog} className={`k-dialog ${danger ? "is-danger" : ""}`} aria-labelledby="confirm-title" onClose={() => setTyped("")}>
      <h2 id="confirm-title">{title}</h2>
      <div className="k-dialog-body">{details}</div>
      {typeToConfirm && <label className="k-dialog-type">Type <strong className="k-mono">{typeToConfirm}</strong> to confirm<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} /></label>}
      <div className="k-dialog-actions">
        <button type="button" className="k-btn" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" className={`k-btn ${danger ? "k-btn-danger" : "k-btn-primary"}`} disabled={!ok} onClick={confirm}>{confirmLabel}</button>
      </div>
    </dialog>
  </>;
}
