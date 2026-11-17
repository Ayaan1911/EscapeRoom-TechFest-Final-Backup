import { randomInt } from "node:crypto";
// Pure helpers for organizer team provisioning (no database access, unit-tested).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 look-alikes
export const VARIANTS = ["A", "B", "C"];
export function generateCode(rand = randomInt) {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[rand(ALPHABET.length)]).join("");
  return Array.from({ length: 5 }, group).join("-"); // 20 chars, ~99 bits
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(v => v.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows.map(r => r.map(v => v.trim()));
}
const ID = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
// CSV header: id,name,participant1,participant2,participant3 (id may be blank to auto-assign)
export function teamsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header || header.join(",").toLowerCase() !== "id,name,participant1,participant2,participant3") throw new Error("CSV header must be: id,name,participant1,participant2,participant3");
  return rows.map((r, i) => {
    if (r.length !== 5) throw new Error(`Row ${i + 2}: expected 5 columns`);
    return { id: r[0].toUpperCase(), name: r[1], participants: r.slice(2) };
  });
}
export function generatedTeams(count) {
  return Array.from({ length: count }, (_, n) => ({ id: "", name: `Fictional team ${n + 1}`, participants: [`Player ${n + 1}A`, `Player ${n + 1}B`, `Player ${n + 1}C`] }));
}
// Returns teams with final IDs and variants balanced against already-registered teams. Throws on any conflict.
export function planTeams(requested, existing, prefix = "GH") {
  if (!ID.test(`${prefix}-01`)) throw new Error("Invalid prefix");
  if (!requested.length || requested.length > 100) throw new Error("Provide 1–100 teams");
  const taken = new Set(existing.map(t => t.id));
  const counts = Object.fromEntries(VARIANTS.map(v => [v, existing.filter(t => t.variant === v).length]));
  const seen = new Set();
  let next = 1;
  return requested.map(t => {
    let id = t.id;
    if (!id) { do id = `${prefix}-${String(next++).padStart(2, "0")}`; while (taken.has(id) || seen.has(id)); }
    if (!ID.test(id)) throw new Error(`Invalid team ID "${id}" (use A–Z, 0–9, hyphen, 2–32 chars)`);
    if (taken.has(id)) throw new Error(`Team ${id} is already registered; existing teams are never overwritten`);
    if (seen.has(id)) throw new Error(`Duplicate team ID ${id} in input`);
    if (!t.name || t.name.length > 80) throw new Error(`Team ${id}: name required (max 80 chars)`);
    if (t.participants.length !== 3 || t.participants.some(p => !p || p.length > 80)) throw new Error(`Team ${id}: exactly three participant names required (max 80 chars each)`);
    seen.add(id);
    const variant = VARIANTS.reduce((best, v) => counts[v] < counts[best] ? v : best);
    counts[variant]++;
    return { ...t, id, variant };
  });
}
export const csvField = value => { const s = String(value); return `"${((/^[\s]*[=+@-]/.test(s)) ? "'" : "") + s.replaceAll('"', '""')}"`; };
