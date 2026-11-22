import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sameOrigin } from "../src/lib/http";

const req = (origin: string | null, host = "192.168.1.20:3000") => new NextRequest("http://0.0.0.0:3000/api/game", { method: "POST", headers: { ...(origin ? { origin } : {}), host } });
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe("sameOrigin", () => {
  it("default (hosted): only APP_ORIGIN or the request origin is accepted; the Host header is ignored", () => {
    process.env.APP_ORIGIN = "https://app.example"; expect(sameOrigin(req("https://app.example"))).toBe(true);
    expect(sameOrigin(req("http://192.168.1.20:3000"))).toBe(false);
    delete process.env.APP_ORIGIN; expect(sameOrigin(req("http://192.168.1.20:3000"))).toBe(false);
  });
  it("LAN mode: Origin host must equal the request Host", () => {
    process.env.GHOST_LAN_HTTP = "1"; delete process.env.APP_ORIGIN;
    expect(sameOrigin(req("http://192.168.1.20:3000"))).toBe(true);
    expect(sameOrigin(req("http://evil.example"))).toBe(false);
    expect(sameOrigin(req("http://192.168.1.20:3001"))).toBe(false);
    expect(sameOrigin(req(null))).toBe(false);
    expect(sameOrigin(req("not a url"))).toBe(false);
  });
  it("LAN mode never overrides a pinned APP_ORIGIN", () => {
    process.env.GHOST_LAN_HTTP = "1"; process.env.APP_ORIGIN = "http://192.168.1.20:3000";
    expect(sameOrigin(req("http://192.168.1.20:3000"))).toBe(true);
    expect(sameOrigin(req("http://localhost:3000", "localhost:3000"))).toBe(false);
  });
});
