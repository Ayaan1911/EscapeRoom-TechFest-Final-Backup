import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { hashPassword } from "../src/lib/password.mjs";
const secret = process.env.GHOST_BOOTSTRAP_SECRET;
if (!secret || secret.length < 12 || secret.length > 256) throw new Error("Access code must contain 12 to 256 characters");
const original = readFileSync(existsSync(".env") ? ".env" : ".env.example", "utf8");
const entry = `ADMIN_ACCESS_HASH="${hashPassword(secret)}"`;
writeFileSync(".env", /^ADMIN_ACCESS_HASH=.*$/m.test(original) ? original.replace(/^ADMIN_ACCESS_HASH=.*$/m, () => entry) : `${original}\n${entry}\n`);
console.log("Organizer hash saved to ignored .env. No credentials were printed.");
