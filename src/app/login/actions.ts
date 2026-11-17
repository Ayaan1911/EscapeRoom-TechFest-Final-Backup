"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/lib/auth";

const NEXT = ["/clue/inbox", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"] as const;
// Participant sign-in. The role is fixed on the server: a client-supplied "role" field is never read, so this action cannot authenticate an organizer.
export async function signIn(form: FormData) {
  const parsed = z.object({ id: z.string().trim().min(1).max(80), code: z.string().min(12).max(256), next: z.enum(NEXT).optional() }).safeParse({ id: form.get("id"), code: form.get("code"), next: form.get("next") || undefined });
  if (!parsed.success) redirect("/login?error=1");
  const { id, code, next } = parsed.data;
  if (!await login("team", id, code)) redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect(next ?? "/play");
}
export async function signOut() { await logout("team"); redirect("/login"); }
