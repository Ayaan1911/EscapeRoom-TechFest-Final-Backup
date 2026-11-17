"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { confirmQualification } from "@/lib/game/qualification.server";

export async function confirmReview(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  const fields = Object.fromEntries([...form].filter(([key]) => !key.startsWith("$ACTION_")));
  const parsed = z.object({ reason: z.string().trim().min(5).max(500), reviewed: z.literal("on") }).strict().safeParse(fields);
  let error = "";
  if (!parsed.success) error = "Record the review reason and acknowledge incomplete cases and overrides.";
  else try { await confirmQualification(parsed.data.reason); } catch { error = "Review unavailable. The round must be closed and results must be readable."; }
  redirect(error ? `/admin?error=${encodeURIComponent(error)}` : "/admin");
}
