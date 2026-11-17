"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/lib/auth";

// Organizer sign-in: its own action, fixed role and fixed id; nothing the browser sends can select another role.
export async function signInOrganizer(form: FormData) {
  const parsed = z.object({ code: z.string().min(12).max(256) }).safeParse({ code: form.get("code") });
  if (!parsed.success || !await login("admin", "organizer", parsed.data.code)) redirect("/organizer/login?error=1");
  redirect("/admin");
}
export async function signOutAdmin() { await logout("admin"); redirect("/organizer/login"); }
