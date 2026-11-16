"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { control } from "@/lib/game/service";

export async function administer(form: FormData) {
  if (!await session("admin")) redirect("/login?role=admin");
  const parsed = z.object({ action: z.enum(["start", "stop", "unlock"]), teamId: z.string().max(80).optional(), reason: z.string().trim().min(5).max(500).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin?error=Invalid+request");
  let error = "";
  try { await control(parsed.data.action, parsed.data.teamId, parsed.data.reason); } catch { error = "Action unavailable. Check round state, team ID and reason."; }
  redirect(error ? `/admin?error=${encodeURIComponent(error)}` : "/admin");
}
