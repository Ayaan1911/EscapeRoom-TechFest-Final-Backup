// Final event credentials: generation, validation, protected storage and card rendering. PURE (no database, no network, no logging of secrets).
//   * ONE canonical bundle is generated once and kept encrypted OUTSIDE the repository (AES-256-GCM with a scrypt-derived key; Node's built-in crypto, no home-made scheme).
//   * Everything random comes from node:crypto (randomInt / randomBytes). Math.random is never used (a unit test greps this file for it).
//   * The bundle is the only place that holds plaintext passwords and the six shared Insider codes. It is imported into any number of databases (credentials-db.mjs).
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scryptSync } from "node:crypto";

export const BUNDLE_FORMAT = "ghost404-credentials";
export const BUNDLE_VERSION = 1;
export const PRIMARY_COUNT = 30;
export const RESERVE_COUNT = 2;
export const TOTAL_TEAMS = PRIMARY_COUNT + RESERVE_COUNT;
export const GROUPS = ["A", "B", "C"];
export const VARIANTS = ["A", "B", "C"];
export const PASSWORD_RE = /^[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$/; // the exact required login password format
export const TEAM_ID_RE = /^TEAM-(0[1-9]|[12][0-9]|3[0-2])$/;
export const PRIVATE_CODE_RE = /^P-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
export const PUBLIC_CODE_RE = /^W-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // 23 uppercase letters: no I, L, O (easy to read on a printed card); 23^9 = 1.8e12 combinations, login attempts are rate limited
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // same alphabet as the Insider shared codes

export const teamIdOf = slot => `TEAM-${String(slot).padStart(2, "0")}`;
export const slotOf = id => Number(id.slice(5));

export function generatePassword(rand = randomInt) {
  const segment = () => Array.from({ length: 3 }, () => LETTERS[rand(LETTERS.length)]).join("");
  return `${segment()}-${segment()}-${segment()}`;
}
export function generateSharedCode(prefix, rand = randomInt) {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[rand(CODE_ALPHABET.length)]).join("");
  return `${prefix}-${part()}-${part()}`;
}
function shuffled(list, rand) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** The one-time generation. Group A/B/C (10 each) and the case variant of every primary team are fixed HERE, so every database receives identical values. */
export function generateBundle({ rand = randomInt, now = new Date(), eventId = "GHOST404-EVENT" } = {}) {
  const passwords = new Set();
  while (passwords.size < TOTAL_TEAMS) passwords.add(generatePassword(rand));
  const pw = [...passwords];
  const slots = Array.from({ length: PRIMARY_COUNT }, (_, i) => i + 1);
  const groupOfSlot = new Map(shuffled(slots, rand).map((slot, i) => [slot, GROUPS[i % GROUPS.length]])); // 10/10/10, not in team order
  const variantOfSlot = new Map(shuffled(slots, rand).map((slot, i) => [slot, VARIANTS[i % VARIANTS.length]])); // case variant, balanced, independent of the Insider group
  const codes = new Set(), fresh = prefix => { let c; do c = generateSharedCode(prefix, rand); while (codes.has(c)); codes.add(c); return c; };
  const fragments = Object.fromEntries(GROUPS.map(g => [g, { private: fresh("P"), public: fresh("W") }]));
  const teams = Array.from({ length: TOTAL_TEAMS }, (_, i) => {
    const slot = i + 1, primary = slot <= PRIMARY_COUNT;
    return { id: teamIdOf(slot), slot, kind: primary ? "primary" : "reserve", name: `Team ${String(slot).padStart(2, "0")}`, password: pw[i], group: primary ? groupOfSlot.get(slot) : null, variant: primary ? variantOfSlot.get(slot) : VARIANTS[rand(VARIANTS.length)] };
  });
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, bundleId: `B-${randomBytes(6).toString("hex").toUpperCase()}`, eventId, createdAt: now.toISOString(), teams, fragments };
}

/** Throws one Error listing problems (never including a password or a code). Returns the bundle unchanged. */
export function validateBundle(bundle) {
  const problems = [];
  const bad = message => problems.push(message);
  if (!bundle || bundle.format !== BUNDLE_FORMAT) bad("not a ghost404 credential bundle");
  if (bundle?.version !== BUNDLE_VERSION) bad(`unsupported bundle version ${bundle?.version}`);
  if (!/^B-[0-9A-F]{12}$/.test(bundle?.bundleId ?? "")) bad("bundleId is malformed");
  if (typeof bundle?.eventId !== "string" || !bundle.eventId) bad("eventId is missing");
  const teams = Array.isArray(bundle?.teams) ? bundle.teams : [];
  if (teams.length !== TOTAL_TEAMS) bad(`expected exactly ${TOTAL_TEAMS} teams, found ${teams.length}`);
  const ids = new Set(), passwords = new Set(), counts = { A: 0, B: 0, C: 0 };
  teams.forEach((t, i) => {
    const slot = i + 1, expected = teamIdOf(slot), label = `team ${i + 1}`;
    if (t.id !== expected || !TEAM_ID_RE.test(t.id)) bad(`${label}: id must be exactly ${expected}`);
    if (ids.has(t.id)) bad(`${label}: duplicate id`); ids.add(t.id);
    if (t.slot !== slot) bad(`${label}: slot must be ${slot}`);
    if (t.kind !== (slot <= PRIMARY_COUNT ? "primary" : "reserve")) bad(`${label}: kind must be ${slot <= PRIMARY_COUNT ? "primary" : "reserve"}`);
    if (typeof t.password !== "string" || !PASSWORD_RE.test(t.password)) bad(`${label}: password does not match XXX-XXX-XXX (uppercase letters)`);
    else { if (passwords.has(t.password)) bad(`${label}: duplicate password`); passwords.add(t.password); }
    if (t.kind === "primary") { if (!GROUPS.includes(t.group)) bad(`${label}: primary teams need a group A, B or C`); else counts[t.group]++; } else if (t.group !== null) bad(`${label}: a reserve has no group until it is activated`);
    if (!VARIANTS.includes(t.variant)) bad(`${label}: variant must be A, B or C`);
    if (typeof t.name !== "string" || !t.name.trim()) bad(`${label}: name is missing`);
  });
  if (!(counts.A === 10 && counts.B === 10 && counts.C === 10)) bad(`primary teams must split 10/10/10 across groups, found ${counts.A}/${counts.B}/${counts.C}`);
  const frag = bundle?.fragments ?? {}, seen = new Set();
  for (const g of GROUPS) {
    const f = frag[g];
    if (!f || !PRIVATE_CODE_RE.test(f.private ?? "")) bad(`fragment ${g}: private code is malformed`);
    if (!f || !PUBLIC_CODE_RE.test(f.public ?? "")) bad(`fragment ${g}: public code is malformed`);
    for (const c of [f?.private, f?.public]) { if (c && seen.has(c)) bad(`fragment ${g}: duplicate code`); if (c) seen.add(c); }
  }
  if (problems.length) throw new Error(`Credential bundle is invalid:\n- ${problems.join("\n- ")}`);
  return bundle;
}

/** A non-secret identity of the provisioning set (ids, kinds, groups, variants and the bundle id). Contains no password and no code. */
export function fingerprint(bundle) {
  const body = JSON.stringify({ bundleId: bundle.bundleId, teams: bundle.teams.map(t => [t.id, t.kind, t.group, t.variant]) });
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

// ---------- protected storage: AES-256-GCM, key from the organizer's passphrase via scrypt ----------
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const keyFor = (passphrase, salt, kdf) => scryptSync(passphrase, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
const aad = (version, kdf) => Buffer.from(`${BUNDLE_FORMAT}-enc|v${version}|scrypt|${kdf.N}|${kdf.r}|${kdf.p}`);
export const MIN_PASSPHRASE = 16;
export function encryptBundle(bundle, passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE} characters.`);
  validateBundle(bundle);
  const salt = randomBytes(16), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keyFor(passphrase, salt, KDF), iv);
  cipher.setAAD(aad(BUNDLE_VERSION, KDF));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  return JSON.stringify({ format: `${BUNDLE_FORMAT}-enc`, version: BUNDLE_VERSION, kdf: "scrypt", ...KDF, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }, null, 2);
}
export function decryptBundle(text, passphrase) {
  let env; try { env = JSON.parse(text); } catch { throw new Error("The file is not a credential bundle."); }
  if (env?.format !== `${BUNDLE_FORMAT}-enc` || env.version !== BUNDLE_VERSION || env.kdf !== "scrypt") throw new Error("The file is not a supported credential bundle.");
  try {
    const kdf = { N: env.N, r: env.r, p: env.p }, decipher = createDecipheriv("aes-256-gcm", keyFor(passphrase, Buffer.from(env.salt, "base64"), kdf), Buffer.from(env.iv, "base64"));
    decipher.setAAD(aad(env.version, kdf)); decipher.setAuthTag(Buffer.from(env.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(env.ciphertext, "base64")), decipher.final()]).toString("utf8");
    return validateBundle(JSON.parse(plain));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Credential bundle is invalid")) throw error;
    throw new Error("Could not decrypt the bundle: wrong passphrase, or the file was altered."); // GCM authentication failed
  }
}

// ---------- printable access cards ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function card(team, fragments, activation) {
  const primary = team.kind === "primary", group = primary ? team.group : activation?.group ?? null;
  const fragment = group
    ? `<div class="row"><span>PRIVATE EVIDENCE FRAGMENT</span><b>GROUP ${esc(group)}</b></div><div class="row"><span>PRIVATE CODE</span><code>${esc(fragments[group].private)}</code></div>`
    : `<div class="row"><span>PRIVATE EVIDENCE FRAGMENT</span><b>NOT ASSIGNED</b></div><p class="note">Assigned only if this reserve account replaces a team. The organizer will hand over an updated card.</p>`;
  return `<article class="card ${primary ? "" : "is-reserve"}"><header><strong>OPERATION GHOST_404</strong><span>${primary ? "TEAM ACCESS CARD" : "RESERVE ACCESS CARD"}</span></header>
<div class="row"><span>TEAM ID</span><code>${esc(team.id)}</code></div><div class="row"><span>PASSWORD</span><code>${esc(team.password)}</code></div>${fragment}
<footer>Keep this card secure. Do not share it, post it or photograph it. Sign in at the address your organizer gives you.</footer></article>`;
}
/** include: "primary" | "reserve" | "all". activations: { "TEAM-31": { group: "A" } } for reserves already activated in the event database (read from there by the CLI). */
export function renderCardsHtml(bundle, { include = "primary", activations = {} } = {}) {
  validateBundle(bundle);
  const teams = bundle.teams.filter(t => include === "all" || t.kind === include);
  const css = `@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font:12pt/1.3 Arial,sans-serif;color:#111;background:#fff}.sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm;page-break-after:always}.sheet:last-child{page-break-after:auto}.card{border:2px solid #111;border-radius:3mm;padding:5mm;height:64mm;display:flex;flex-direction:column;justify-content:space-between;break-inside:avoid}.card.is-reserve{border-style:dashed}.card header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #111;padding-bottom:2mm}.card header strong{font-size:12pt;letter-spacing:.08em}.card header span{font-size:8.5pt;letter-spacing:.14em}.row{display:flex;justify-content:space-between;align-items:center;gap:4mm}.row span{font-size:7.5pt;letter-spacing:.1em;color:#333}.row code,.row b{font:700 14pt "Courier New",monospace;letter-spacing:.06em}.note{margin:0;font-size:8pt;color:#333}.card footer{font-size:7pt;color:#444}.cover{padding:8mm;border:2px solid #111;margin-bottom:6mm}.cover h1{margin:0 0 3mm;font-size:16pt}.cover p{margin:1mm 0;font-size:10pt}@media screen{body{padding:10mm;background:#eee}.sheet,.cover{max-width:190mm;margin-left:auto;margin-right:auto;background:#fff}}`;
  const pages = []; for (let i = 0; i < teams.length; i += 8) pages.push(teams.slice(i, i + 8));
  const cover = `<section class="cover"><h1>CONFIDENTIAL — ${include === "reserve" ? "reserve" : include === "all" ? "all" : "team"} access cards</h1><p>Bundle ${esc(bundle.bundleId)} · ${teams.length} card(s). This file contains plaintext passwords. Print it, then delete the file and empty the recycle bin. Never e-mail, upload or commit it.</p></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>GHOST_404 access cards (CONFIDENTIAL)</title><style>${css}</style></head><body>${cover}${pages.map(p => `<section class="sheet">${p.map(t => card(t, bundle.fragments, activations[t.id])).join("")}</section>`).join("")}</body></html>`;
}
