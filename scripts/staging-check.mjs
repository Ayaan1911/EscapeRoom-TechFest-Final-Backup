// Static safety check of the PREPARED staging configuration. Reads files only: no network, no database, no secrets. Exit 1 on any violation.
//   npm run staging:check
import { readFileSync } from "node:fs";
const read = f => readFileSync(f, "utf8");
const bp = read("render.staging.yaml"), env = read(".env.staging.example"), prod = read("render.yaml"), ignore = read(".gitignore");
const problems = [];
const need = (ok, msg) => { if (!ok) problems.push(msg); };
need(/^\s+name:\s*ghost404-staging-loadtest(\s|$)/m.test(bp), "service name must be ghost404-staging-loadtest (contains 'loadtest')");
need(/autoDeploy:\s*false/.test(bp), "autoDeploy must be false");
need(!/ghost404-round1-preview/.test(bp.replace(/^\s*#.*$/gm, "")), "the staging blueprint must not reference the existing preview service");
need(/healthCheckPath:\s*\/api\/health/.test(bp), "healthCheckPath must be /api/health");
for (const key of ["DATABASE_URL", "DIRECT_URL", "ADMIN_ACCESS_HASH", "APP_ORIGIN"]) need(new RegExp(String.raw`key:\s*${key}[^\n]*\n\s+sync:\s*false`).test(bp), `${key} must be sync: false (entered in the dashboard, never stored)`);
need(!/postgres(ql)?:\/\/[^\s"]*@/.test(bp.replace(/^\s*#.*$/gm, "")), "the blueprint must not contain a connection string");
need(!/ep-aged-sound-ao2lwi7k|neondb/.test(bp + env), "the existing preview database must not appear in staging files");
need(!/scrypt\$[0-9a-f]{20,}/i.test(env) && !/:\/\/[^:\s"]+:(?!PASSWORD)[^@\s"]{6,}@/.test(env), ".env.staging.example must contain placeholders only");
need(/loadtest/.test(env), ".env.staging.example must name a loadtest database");
need(/\.env\*/.test(ignore) && /!\.env\.staging\.example/.test(ignore), ".gitignore must ignore .env* and allow only the example files");
need(/ghost404-round1-preview/.test(prod), "render.yaml (the existing preview) must be unchanged");
need(!/GHOST_TX_MODE/.test(bp.replace(/^\s*#.*$/gm, "")), "GHOST_TX_MODE must not be set in the staging blueprint (default = per-team lock)");
need(/plan:\s*standard\s*#\s*PLACEHOLDER/.test(bp), "the plan must stay marked as a placeholder until the budget is approved");
if (problems.length) { console.error("STAGING CONFIG CHECK FAILED:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("staging configuration check passed (13 static checks; nothing was created or contacted)");
