"use server";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { activateReserve, ReserveError } from "@/lib/game/reserve.server";

/** Replace one primary team by a reserve account (organizer only, audited). The form carries no secret and the action never reads one. */
export async function activateReserveAction(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  let message = "";
  try {
    const r = await activateReserve({ reserveId: String(form.get("reserveId") ?? ""), replacesId: String(form.get("replacesId") ?? ""), reason: String(form.get("reason") ?? ""), acknowledgeProgress: form.get("acknowledgeProgress") === "on" });
    message = `done=${encodeURIComponent(`${r.reserveId} now replaces ${r.replacesId} (Group ${r.group}).`)}`;
  } catch (error) { message = `error=${encodeURIComponent(error instanceof ReserveError ? error.message : "Could not activate the reserve.")}`; }
  redirect(`/admin/credentials?${message}`);
}
