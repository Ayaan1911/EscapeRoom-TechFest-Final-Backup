import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, json, readBody } from "@/lib/round2/http.server";
import { R2Error } from "@/lib/round2/common.server";
import { runCommand, terminalState } from "@/lib/round2/paper/terminal.server";

// Inject 2 simulated terminal (open-60 only). Signed-in active finalists only (checked inside the service). Never touches a real network.
export const GET = () => guarded(async () => json(await terminalState()));
const body = z.object({ command: z.string().max(80) }).strict();
export const POST = (req: NextRequest) => guarded(async () => {
  const parsed = body.safeParse(await readBody(req, 512));
  if (!parsed.success) throw new R2Error(400, "Invalid request");
  return json(await runCommand(parsed.data.command));
});
