"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/lib/auth";

export async function signIn(form: FormData) {
  const parsed = z.object({ role: z.enum(["team", "admin"]), id: z.string().trim().max(80), code: z.string().min(12).max(256), next: z.enum(["/clue/inbox", "/play/inbox"]).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/login?error=1");
  const { role, id, code, next } = parsed.data;
  if (!await login(role, role === "admin" ? "organizer" : id, code)) redirect(`/login?role=${role}&error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect(role === "admin" ? "/admin" : next ?? "/play");
}
export async function signOut() { await logout(); redirect("/login"); }
