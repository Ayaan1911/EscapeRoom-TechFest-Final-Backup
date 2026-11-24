"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { advanceTopTen, AdvanceError } from "@/lib/game/qualification.server";
import { R2Error } from "@/lib/round2/common.server";

/** "Confirm Top 10 and Advance to Round 2". Server-authorized, transactional, idempotent. Never starts Round 2. */
export async function confirmReview(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  const tie = form.getAll("tie").filter((v): v is string => typeof v === "string");
  const fields = Object.fromEntries([...form].filter(([key]) => !key.startsWith("$ACTION_") && key !== "tie"));
  const parsed = z.object({ reason: z.string().trim().min(5).max(500), reviewed: z.literal("on") }).strict().safeParse(fields);
  let error = "", ok = "";
  if (!parsed.success) error = "Record the review reason and acknowledge incomplete cases and overrides.";
  else if (tie.length > 12 || tie.some(id => id.length > 80)) error = "Invalid tie selection.";
  else try {
    const result = await advanceTopTen({ reason: parsed.data.reason, tie });
    ok = result.unchanged ? "Already confirmed: nothing changed." : `Top ${result.top10.length} confirmed and advanced to Round 2. Start the shared 60-minute round from the Round 2 control room when ready.`;
  } catch (e) { error = e instanceof AdvanceError || e instanceof R2Error ? e.message : "Review unavailable. Check that Round 1 is closed and try again."; }
  redirect(error ? `/admin?error=${encodeURIComponent(error)}#qualification` : `/admin?notice=${encodeURIComponent(ok)}#qualification`);
}
