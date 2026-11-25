import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Round 1 chapter pages are Server Components: any prop they pass to a Client Component is serialized into the initial HTML /
// Flight payload (View Source). Evidence must therefore be fetched by the client from the authenticated, no-store chapter APIs.
const chapters = ["inbox", "trail", "insider", "containment", "verdict"] as const;
const page = (c: string) => readFileSync(`src/app/play/${c}/page.tsx`, "utf8");

describe("Round 1 evidence is not serialized into chapter pages", () => {
  for (const c of chapters) it(`/play/${c} passes no evidence, dossier or CCTV prop`, () => {
    const src = page(c);
    expect(src).not.toMatch(/\bevidence=\{/);
    expect(src).not.toMatch(/\bcctv=\{/);
    expect(src).not.toMatch(/initialDossier=\{access/);
    expect(src).not.toMatch(/(inbox|trail|containment|verdict)Evidence\(|insiderDossier\(|containmentCctv\(/);
  });
  it("chapter pages render the client loaders (or the self-fetching Insider desk with a null dossier)", () => {
    for (const c of ["inbox", "trail", "containment", "verdict"]) expect(page(c)).toMatch(/DeskLoader /);
    expect(page("insider")).toMatch(/initialDossier=\{null/);
  });
  it("every evidence API is authenticated and never cached", () => {
    for (const c of chapters) {
      const route = readFileSync(`src/app/api/game/${c}/route.ts`, "utf8");
      expect(route).toMatch(new RegExp(`${c}Access\\(\\)`));
      expect(route).toMatch(/"Cache-Control": "no-store"/);
    }
    const access = readFileSync("src/lib/game/inbox-access.server.ts", "utf8");
    expect(access).toMatch(/session\("team"\)/); expect(access).toMatch(/status: 401/); expect(access).toMatch(/status === "waiting"/);
    expect(access).not.toMatch(/Solution\(/);
  });
});
