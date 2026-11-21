import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, json, readBody } from "@/lib/round2/http.server";
import { R2Error, requireFinalist } from "@/lib/round2/common.server";
import { submitTask } from "@/lib/round2/play.server";

const body = z.object({ taskId: z.string().min(1).max(60), answer: z.unknown() }).strict(); // any extra field (e.g. a client-supplied score) is rejected
export const POST = (req: NextRequest) => guarded(async () => {
  const teamId = await requireFinalist();
  const parsed = body.safeParse(await readBody(req, 16_384));
  if (!parsed.success) throw new R2Error(400, "Invalid request");
  return json(await submitTask(teamId, parsed.data.taskId, parsed.data.answer));
});
