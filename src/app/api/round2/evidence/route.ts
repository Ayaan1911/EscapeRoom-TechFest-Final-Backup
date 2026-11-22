import { json } from "@/lib/round2/http.server";

// Retired: GHOST RETURNS is answered on paper. Nothing is submitted, drafted, scored or published online (legacy 8-unit implementation kept in git history and lib/round2/*.server.ts only).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const retired = (_request?: Request) => json({ error: "Round 2 is paper-based. Nothing is submitted online." }, 410);
export const GET = retired, POST = retired, PUT = retired;
