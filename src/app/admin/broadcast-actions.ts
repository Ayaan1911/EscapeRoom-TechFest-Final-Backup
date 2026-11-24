"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { setBroadcast } from "@/lib/game/broadcast.server";
import { BROADCAST_KEYS } from "@/lib/game/broadcast";

/** Organizer switch for what the hall projector may show. Audited; each change asks for confirmation in the UI. */
export async function setBroadcastAction(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  const fields = Object.fromEntries([...form].filter(([key]) => !key.startsWith("$ACTION_")));
  const parsed = z.object({ key: z.enum(BROADCAST_KEYS), on: z.enum(["1", "0"]), reason: z.string().trim().min(5).max(300) }).strict().safeParse(fields);
  let error = "";
  if (!parsed.success) error = "Give a short reason (5 to 300 characters) for the projector change.";
  else try { await setBroadcast(parsed.data.key, parsed.data.on === "1", parsed.data.reason); } catch (e) { error = (e as Error).message || "Change unavailable."; }
  redirect(error ? `/admin/leaderboard?error=${encodeURIComponent(error)}` : "/admin/leaderboard");
}
