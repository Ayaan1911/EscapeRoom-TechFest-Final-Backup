import { describe, expect, it } from "vitest";
import { cookieSecure } from "../src/lib/auth-policy";

describe("session cookie Secure policy", () => {
  it("is Secure in production without the flag and with an https origin", () => {
    expect(cookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "production", APP_ORIGIN: "https://x.onrender.com" })).toBe(true);
  });
  it("relaxes only for the explicit LAN flag and a non-https origin", () => {
    expect(cookieSecure({ NODE_ENV: "production", GHOST_LAN_HTTP: "1", APP_ORIGIN: "http://192.168.1.20:3000" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "production", GHOST_LAN_HTTP: "1" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "production", GHOST_LAN_HTTP: "1", APP_ORIGIN: "https://x.example" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "production", APP_ORIGIN: "http://192.168.1.20:3000" })).toBe(true);
  });
  it("is not Secure outside production (dev/test over http)", () => { expect(cookieSecure({ NODE_ENV: "development" })).toBe(false); });
});
