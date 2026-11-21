import type { Bundle, ResultsPayload, ServerDraft, StatusPayload, SubmitOutcome } from "./types";

/** Error from the API. `status` 0 means the request never got an answer (offline / interrupted). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number, public body?: Record<string, unknown>) { super(message); }
}
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init }); }
  catch { throw new ApiError(0, "No connection to the server"); }
  let body: Record<string, unknown> | null = null;
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON error body */ }
  if (!res.ok) throw new ApiError(res.status, typeof body?.error === "string" ? body.error : `Request failed (${res.status})`, typeof body?.retryAfter === "number" ? body.retryAfter : undefined, body ?? undefined);
  return body as T;
}
const send = (method: string, payload: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const fetchStatus = () => call<StatusPayload>("/api/round2/status");
export const fetchBundle = () => call<Bundle>("/api/round2/evidence");
export const fetchDrafts = async () => (await call<{ drafts: ServerDraft[] }>("/api/round2/drafts")).drafts;
export const putDraft = (taskId: string, data: unknown, baseVersion: number) => call<ServerDraft>("/api/round2/drafts", send("PUT", { taskId, data, baseVersion }));
export const postSubmit = (taskId: string, answer: unknown) => call<SubmitOutcome>("/api/round2/submit", send("POST", { taskId, answer }));
export const fetchResults = () => call<ResultsPayload>("/api/round2/results");
export const adminGet = <T>(view: string) => call<T>(`/api/round2/admin?view=${encodeURIComponent(view)}`);
export const adminPost = <T>(body: unknown) => call<T>("/api/round2/admin", send("POST", body));
