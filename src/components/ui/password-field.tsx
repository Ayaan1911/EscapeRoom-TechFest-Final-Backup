"use client";
/* A masked text field with a Show/Hide eye. Hidden by default; the toggle only changes how the user's own typed text is displayed (input type), never the value,
   and it never submits the form (type="button"). It re-masks itself when the form is submitted. The button sits OUTSIDE the label so the field's accessible name stays "Access code". */
import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({ label, name, autoComplete = "current-password", required, minLength, maxLength }: { label: string; name: string; autoComplete?: string; required?: boolean; minLength?: number; maxLength?: number }) {
  const [shown, setShown] = useState(false), input = useRef<HTMLInputElement>(null), controls = useId();
  useEffect(() => { // re-mask on submit (the form is read before this re-render, so the value is unaffected)
    const form = input.current?.form, hide = () => setShown(false);
    form?.addEventListener("submit", hide); return () => form?.removeEventListener("submit", hide);
  }, []);
  return <div className="pw-field">
    <label>{label}<input ref={input} id={controls} type={shown ? "text" : "password"} name={name} required={required} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} spellCheck={false} autoCapitalize="off" /></label>
    <button type="button" className="pw-eye" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} aria-controls={controls} onClick={() => setShown(s => !s)}>
      {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
    </button>
  </div>;
}
