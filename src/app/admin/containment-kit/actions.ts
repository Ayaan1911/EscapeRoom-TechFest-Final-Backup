"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { authorizeContainmentCopy } from "@/lib/game/containment-access.server";

export async function grantCopy(form: FormData) {
  if (!await session("admin")) redirect("/organizer/login");
  const fields = Object.fromEntries([...form].filter(([key]) => !key.startsWith("$ACTION_")));
  const parsed = z.object({ teamId: z.string().trim().min(1).max(80), reason: z.string().trim().min(5).max(500) }).strict().safeParse(fields);
  let error = "";
  if (!parsed.success) error = "Provide a registered team and a reason of at least five characters.";
  else try { await authorizeContainmentCopy(parsed.data.teamId, parsed.data.reason); } catch { error = "Copy unavailable. Check team progression and active round."; }
  redirect(`/admin/containment-kit?${error ? `error=${encodeURIComponent(error)}` : "authorized=1"}`);
}
