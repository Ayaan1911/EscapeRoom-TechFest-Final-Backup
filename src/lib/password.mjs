import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}
export function verifyPassword(value, stored) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(hash, "hex"));
}
export function digest(value) { return createHash("sha256").update(value).digest("hex"); }
