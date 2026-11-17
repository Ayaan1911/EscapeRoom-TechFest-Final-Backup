import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from "node:crypto";

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
// Non-blocking variant for request handlers: scryptSync would stall the event loop for every other team.
const scryptAsync = (value, salt) => new Promise((accept, reject) => scrypt(value, salt, 64, (error, key) => error ? reject(error) : accept(key)));
export async function verifyPasswordAsync(value, stored) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(await scryptAsync(value, salt), Buffer.from(hash, "hex"));
}
