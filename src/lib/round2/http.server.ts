import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/http";
import { parseSafeJson, UnsafeJson } from "./safe-json";
import { R2Error } from "./common.server";

const noStore = { "Cache-Control": "no-store" };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
/** Maps expected R2Errors to their status and everything else to a generic 503 (details stay in the server log, never in the response). */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (error instanceof R2Error) return json({ error: error.message, ...(error.extra ?? {}) }, error.status);
    console.error("round2 route failure", error instanceof Error ? error.name : "unknown");
    return json({ error: "Unable to complete the request. Retry." }, 503);
  }
}
/** Same-origin, size-limited, prototype-safe JSON body. */
export async function readBody(req: NextRequest, maxBytes: number): Promise<unknown> {
  if (!sameOrigin(req)) throw new R2Error(403, "Invalid origin");
  if (Number(req.headers.get("content-length")) > maxBytes) throw new R2Error(413, "Request too large");
  const raw = await req.text();
  try { return parseSafeJson(raw, maxBytes); }
  catch (e) { throw new R2Error(e instanceof UnsafeJson && e.message === "too large" ? 413 : 400, "Invalid request body"); }
}
