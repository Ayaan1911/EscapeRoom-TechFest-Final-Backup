"use client";
import { useFormStatus } from "react-dom";

/** Submit button with a real pending state (the sign-in server action hashes the code, which takes a moment under load). */
export function SignInButton() {
  const { pending } = useFormStatus();
  return <button className="k-btn k-btn-primary k-btn-lg os-signin" disabled={pending} aria-busy={pending}>{pending ? "Authenticating…" : "Sign in"}</button>;
}
