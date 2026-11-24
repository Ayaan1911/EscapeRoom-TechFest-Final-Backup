"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { convertEarlierToShared } from "@/lib/game/evidence-wall.server";

/** Organizer-only, explicit, audited conversion of an earlier per-team Evidence Wall preparation to the shared pairs. Requires the typed word CONVERT and the backup acknowledgement.
 *  Never runs by itself, never deletes anything, never touches three-pair or two-fragment teams. */
export async function convertEarlierPreparation(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  const parsed = z.object({ confirm: z.literal("CONVERT"), backup: z.literal("on") }).safeParse({ confirm: String(form.get("confirm") ?? "").trim(), backup: form.get("backup") });
  if (!parsed.success) redirect("/admin/insider-kit?error=" + encodeURIComponent("Type CONVERT and confirm that a database backup exists."));
  const { converted } = await db.$transaction(async tx => {
    const result = await convertEarlierToShared(tx);
    await tx.auditLog.create({ data: { actor: "organizer", action: "insider-shared-conversion", detail: JSON.stringify({ converted: result.converted }) } });
    return result;
  }, { isolationLevel: "Serializable" });
  redirect(`/admin/insider-kit?converted=${converted}`);
}
