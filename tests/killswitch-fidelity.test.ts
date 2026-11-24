import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INJECT_CONTENT, MONITOR_IPS } from "../src/lib/round2/paper/content-v2.server";
import { attemptsLabel, BANNER, MSG, PROMPT } from "../src/lib/round2/paper/killswitch-text";
import { parseCommand, terminalScore, MAX_BLOCKS } from "../src/lib/round2/paper/terminal.server";

// Inject 2 (Kill Switch): exact wording from the owner's brief for the approved case document. Pins the PUBLIC content only.
// Nothing here states which connections are the attackers. The eight wrong-block messages are verified against the private key through ONE
// combined hash (they are not reproduced here), and only when that private file is installed on the machine running the tests.
const i2 = INJECT_CONTENT[2];
if (i2.kind !== "i2") throw new Error("unexpected kind");

describe("Inject 2 content: exact source wording", () => {
  it("ten connections, in order, with the document's times and durations", () => {
    expect(i2.snapshot).toBe("02:50");
    expect(i2.connections.map(c => [c.n, c.ip, c.process, c.country, c.sent, c.received, c.time])).toEqual([
      [1, "192.0.2.25", "mail-sync.exe", "India", "6 MB", "9 MB", "all night"],
      [2, "198.51.100.12", "backup-agent.exe", "Ireland", "4.2 GB", "0.1 GB", "02:00 to 02:41 (41 min)"],
      [3, "203.0.113.9", "vpn-gateway.exe", "UAE", "12 MB", "25 MB", "02:44 to now (6 min)"],
      [4, "198.51.100.77", "backup-agent2.exe", "Ireland", "380 MB", "0.2 MB", "02:30 to 02:40 (10 min)"],
      [5, "192.0.2.81", "git-sync.exe", "India", "18 MB", "11 MB", "02:10 to now (40 min)"],
      [6, "203.0.113.45", "wsvc_sync.exe", "Netherlands", "0.1 MB", "0.1 MB", "02:22 to now (28 min)"],
      [7, "198.51.100.140", "media-share.exe", "Portugal", "372 MB", "0.3 MB", "02:28 to 02:41 (13 min)"],
      [8, "203.0.113.88", "asset-agent.exe", "India", "0.2 MB", "0.2 MB", "21:04 to now (5 h 46 min)"],
      [9, "203.0.113.30", "os-update-agent.exe", "Germany", "12 MB", "1.1 GB", "02:35 to 02:49 (14 min)"],
      [10, "192.0.2.92", "hr-portal-sync.exe", "Seychelles", "22 MB", "4 MB", "01:00 to 01:15 (15 min)"],
    ]);
    expect(MONITOR_IPS).toHaveLength(10); expect(MONITOR_IPS).not.toContain("203.0.113.250"); // Inject 1's Server X is not on this monitor
  });

  it("ten Inspect descriptions and ticket references, word for word", () => {
    expect(i2.connections.map(c => [c.ticket, c.description])).toEqual([
      ["None needed", "Standard laptop software. Light and steady all night."],
      ["IT-4390", "Nightly backup from the IT backup server. Same size as last week."],
      ["IT-4496", "CEO is travelling tonight. Bursts of use from an overseas airport. Sign-in passed the extra security check."],
      ["None", "Second backup job, approved verbally by the IT Head. Sends one big batch, then goes quiet."],
      ["IT-4471", "Developer’s test sync. Short bursts, human-paced."],
      ["IT-4518", "Sync service for the file server. One tiny packet every 60 seconds."],
      ["IT-4477", "Marketing contractor uploading campaign videos. Approved window 02:00 to 03:00."],
      ["IT-4502", "Asset tracker rollout since last Friday, installed by IT, sign-off pending. One tiny packet every 60 seconds."],
      ["IT-4400", "Big download from the OS vendor’s server in the 02:30 to 03:00 window."],
      ["IT-4510", "Nightly benefits sync at 01:00 with an overseas vendor."],
    ]);
  });

  it("eight IT tickets with exact text, creation time and status, plus the footer", () => {
    expect(i2.tickets.map(t => [t.id, t.text, t.created, t.status])).toEqual([
      ["IT-4390", "Nightly backup: backup-agent.exe, 02:00 daily, IT backup server only. One backup job only. Any new job needs a ticket.", "Last month", "Approved"],
      ["IT-4400", "OS updates, 02:30 to 03:00 from the vendor’s server", "Yesterday 16:00", "Approved"],
      ["IT-4471", "Developer test sync, git-sync.exe, window 02:00 to 03:00 tonight", "Yesterday 17:20", "Approved"],
      ["IT-4477", "Contractor upload, media-share.exe, window 02:00 to 03:00 tonight", "Yesterday 18:30", "Approved"],
      ["IT-4496", "CEO travel access, overseas, tonight", "Yesterday 20:15", "Approved"],
      ["IT-4502", "Asset tracker rollout, asset-agent.exe, all machines", "Last Friday", "Installed, sign-off pending"],
      ["IT-4510", "Benefits sync, hr-portal-sync.exe, nightly 01:00", "Last quarter", "Approved"],
      ["IT-4518", "File server sync service, wsvc_sync.exe, created by svc-sync (service account)", "Tonight 02:31", "Approved"],
    ]);
    expect(i2.ticketFooter).toBe("Standard laptop software needs no ticket: mail-sync.exe.");
    for (const c of i2.connections) if (c.ticket.startsWith("IT-")) expect(i2.tickets.some(t => t.id === c.ticket)).toBe(true); // every referenced ticket exists
  });

  it("paper instructions name the three things to write; the attempt limit is four", () => {
    expect(i2.paper).toEqual(["The two attacker IP addresses", "Evidence supporting the identification", "Why a convincing legitimate connection must not be blocked"]);
    expect(i2.maxAttempts).toBe(4); expect(MAX_BLOCKS).toBe(4);
  });

  it("public content carries no classification, suspicion label, answer flag or hint", () => {
    expect(JSON.stringify(i2)).not.toMatch(/rogue|malicious|isRogue|correct|suspicious|decoy|attacker-controlled|answer|verdict|flag/i);
    for (const c of i2.connections) expect(Object.keys(c).sort()).toEqual(["country", "description", "ip", "n", "process", "received", "sent", "ticket", "time"]);
    for (const t of i2.tickets) expect(Object.keys(t).sort()).toEqual(["created", "id", "status", "text"]);
  });

  it("agrees with Injects 1, 3 and 4 (no contradiction, nothing changed there)", () => {
    const i3 = INJECT_CONTENT[3]; if (i3.kind !== "i3") throw new Error();
    const r = (id: string) => i3.records.find(x => x.id === id)!.text, row = (n: number) => i2.connections[n - 1];
    expect(r("R-4")).toContain("first seen at 02:22"); expect(row(6).time).toMatch(/^02:22 to now/);
    expect(r("R-4")).toContain("380 MB burst from 02:30 to 02:40"); expect(row(4).sent).toBe("380 MB"); expect(row(4).time).toMatch(/^02:30 to 02:40/);
    expect(r("R-3")).toContain("about 4.2 GB"); expect(r("R-3")).toContain("02:00 to 02:41"); expect(row(2).sent).toBe("4.2 GB"); expect(row(2).time).toMatch(/^02:00 to 02:41/);
    expect(r("R-5")).toContain("at 02:35"); expect(row(9).time).toMatch(/^02:35 to/); expect(row(3).time).toMatch(/^02:44 to now/); // 21:14 UTC = 02:44 IST
    expect(r("R-7")).toContain("svc-sync"); expect(i2.tickets.find(t => t.id === "IT-4518")!.text).toContain("svc-sync"); expect(i2.tickets.find(t => t.id === "IT-4518")!.created).toBe("Tonight 02:31");
  });
});

describe("Kill Switch terminal wording and parser", () => {
  it("opening banner, prompt and attempt label", () => {
    expect([...BANNER]).toEqual(["NEXUS SOC TERMINAL v2.1", "KILL SWITCH ACCESS GRANTED", "Type BLOCK <ip address> to cut a connection.", "You have 4 attempts. Choose carefully."]);
    expect(PROMPT).toBe("ghost@nexus:~$"); expect(attemptsLabel(4, 4)).toBe("ATTEMPTS LEFT: 4/4"); expect(attemptsLabel(1, 4)).toBe("ATTEMPTS LEFT: 1/4");
  });
  it("every parser message, exactly", () => {
    expect(MSG).toEqual({
      unknown: "Unknown command. Usage: BLOCK <ip address>", missing: "Missing IP address. Usage: BLOCK <ip address>", tooMany: "Too many arguments. Usage: BLOCK <ip address>",
      invalid: "Invalid IP address format.", notListed: "Not a connection on this list.", duplicate: "Already blocked.", locked: "Terminal locked.",
      contained: "[OK] Both threats contained. Terminal locked.", exhausted: "[FAIL] Out of attempts. Terminal locked. See a volunteer.",
    });
  });
  it.each([
    ["BLOK 203.0.113.45", MSG.unknown], ["BLCOK 203.0.113.45", MSG.unknown], ["", MSG.unknown], ["rm -rf /", MSG.unknown], ["BLOCK", MSG.missing], ["block   ", MSG.missing],
    ["BLOCK 203.0.113.999", MSG.invalid], ["BLOCK abc", MSG.invalid], ["BLOCK 1.1.1.1 2.2.2.2", MSG.tooMany],
  ])("%j is refused as %j and so costs nothing", (line, message) => expect(parseCommand(line)).toEqual({ message }));
  it.each(["block 203.0.113.45", "BLOCK 203.0.113.45", "  Block\t203.0.113.45  "])("accepts %j (case and spacing do not matter)", line => expect(parseCommand(line)).toEqual({ ip: "203.0.113.45" }));
  it("the terminal never builds a shell, process or firewall call from input", () => {
    expect(readFileSync("src/lib/round2/paper/terminal.server.ts", "utf8")).not.toMatch(/child_process|execSync|execFile|\bspawn|\beval\(|new Function|netsh|iptables/);
  });
  it("the 15-point score formula is unchanged (an untouched terminal scoring 5 is flagged for the owner, not altered here)", () => {
    expect(terminalScore([])).toBe(5); // owner decision pending: literal formula
    expect(terminalScore(["caught", "caught"])).toBe(15); expect(terminalScore(["caught"])).toBe(10); expect(terminalScore(["cleared"])).toBe(0); expect(terminalScore(["caught", "cleared"])).toBe(3);
    expect(terminalScore(["cleared", "cleared", "cleared", "cleared"])).toBe(0); expect(terminalScore(["caught", "caught", "cleared", "cleared"])).toBe(6);
  });
});

describe.skipIf(!existsSync("private/round2-key-v2.json"))("private key (only when it is installed on this machine)", () => {
  const key = existsSync("private/round2-key-v2.json") ? JSON.parse(readFileSync("private/round2-key-v2.json", "utf8")).inject2 : null;
  it("is approved, names two monitored attackers, and every other monitored connection has its own angry message", () => {
    expect(key.status).toBe("approved"); expect(key.malicious).toHaveLength(2); expect(key.malicious.every((ip: string) => MONITOR_IPS.includes(ip))).toBe(true);
    for (const c of i2.connections) expect(typeof key.wrongMessages[c.ip] === "string", `connection ${c.n}`).toBe(!key.malicious.includes(c.ip)); // attackers have none, everyone else has one
  });
  it("the eight angry messages match the approved wording exactly (one combined hash; the text is not reproduced here)", () => {
    const list = i2.connections.filter(c => key.wrongMessages[c.ip] !== undefined).map(c => [c.n, key.wrongMessages[c.ip]]);
    expect(list).toHaveLength(8);
    expect(createHash("sha256").update(JSON.stringify(list)).digest("hex")).toBe("db5177aa1fb3f0b90c466affa3a751677b42b2e04fbccbd68fcd72125027e936");
  });
});
