import "server-only";
// PARTICIPANT-FACING Round 2 content. Fictional and inert: Meridian Freight Holdings, RFC 5737 documentation IPs, *.example domains.
// This file must never contain answer keys. Option ids are opaque; correctness lives only in tasks.server.ts.
// Release is enforced by bundleFor() (service.server.ts): a unit's content is returned only once the server clock has released it.

export type R2Record = { id: string; time: string; source: string; title: string; detail: string };
export type Opt = { id: string; text: string };
export type TaskPrompt = { id: string; prompt: string; answer: string; lists?: Record<string, Opt[]> };
export type Unit = { part: "A" | "B"; unit: number; title: string; story: string; records: R2Record[]; tasks: TaskPrompt[]; extra?: Record<string, unknown> };

const rec = (id: string, time: string, source: string, title: string, detail: string): R2Record => ({ id, time, source, title, detail });
const opts = (...pairs: [string, string][]): Opt[] => pairs.map(([id, text]) => ({ id, text }));
const CLASSES = opts(["benign", "Benign / authorized behaviour"], ["suspicious", "Suspicious, not confirmed compromised"], ["compromise", "Confirmed compromise"]);

export const CASE_BRIEF = "Meridian Freight Holdings (fictional). Month-end close, 2026-12-05. All times UTC unless a record states its own clock. Every host, address, person and domain is fictional and inert; BLOCK actions are simulations only. You may use AI tools and the internet, but every answer is graded against these records: verify before you submit.";

// ---------- PART A ----------
const incident1: Unit = {
  part: "A", unit: 1, title: "Alert at 2:14 AM",
  story: "02:14. The network sensor raises 'Finance laptop outbound anomaly' on FIN-LT-07, and the identity platform has just flagged an 'impossible travel' sign-in for p.okafor. Decide what is confirmed, what is merely suspicious, and what is normal month-end work. Panic-driven overblocking during month-end close is penalized.",
  records: [
    rec("E-101", "01:30", "identity", "Failed sign-in burst", "Source 192.0.2.150 attempted 4 sign-ins each against 9 finance accounts (36 failures) between 01:30 and 01:34. 0 successes. p.okafor: 4 failures."),
    rec("E-102", "02:05:41", "identity", "p.okafor sign-in from hosting provider", "Success from 198.51.100.77 (Frankfurt, AS64500 HostRack hosting). Method: refresh-token replay; no password step, no MFA step. Device: none / unregistered. User agent python-httpx/0.27 (baseline for this user is Chrome/126 on Windows). Session S-7F31."),
    rec("E-103", "02:09:12", "identity", "p.okafor sign-in from Lagos", "Success from 192.0.2.88 (Lagos, NG). Device FIN-LT-07 (registered, compliant). Password + MFA push approved on the enrolled phone. User agent Chrome/126. Session S-7A20. The 'impossible travel' alert compares this event with E-102."),
    rec("E-104", "n/a", "hr", "Approved travel TRV-882", "p.okafor approved to work remotely from Lagos 2026-12-04 to 2026-12-08, month-end close. The laptop FIN-LT-07 travels with the employee."),
    rec("E-105", "01:12:07", "endpoint", "Browser extension installed on FIN-LT-07", "Extension 'PDF Viewer Plus' loaded manually from a local CRX file ('Load unpacked'); not from the managed extension store; unsigned; publisher unknown. Permissions: cookies, all sites. Installed in the user context of p.okafor."),
    rec("E-106", "02:13:55", "endpoint", "EDR: unsigned host process on FIN-LT-07", "chrome_ext_host.exe (unsigned, parent chrome.exe) read the browser cookie store 14 times between 01:15 and 02:13 and made outbound HTTPS connections totalling 38.2 MB to 198.51.100.77:443."),
    rec("E-107", "02:14:03", "network", "NDR alert: finance laptop outbound anomaly", "FIN-LT-07 to 198.51.100.77:443, 38.2 MB since 01:15, periodic check-ins every 300 s (+/- 3 s). Server presents a self-signed certificate. This is the 2:14 AM alert."),
    rec("E-108", "02:00:30", "network", "Large transfer from FIN-LT-07 to vendor", "FIN-LT-07 to 203.0.113.10:443, 210 MB over 11 minutes. Process ledger_sync.exe (vendor-signed). Destination is on the approved-vendor allow-list (LedgerBridge)."),
    rec("E-109", "n/a", "change", "Change CHG-5521", "Month-end ledger sync, host FIN-LT-07, window 01:55-02:15 UTC, destination 203.0.113.10 only. Approved by the Finance Controller."),
    rec("E-110", "01:48", "endpoint", "AV quarantine on FIN-LT-09", "FIN-LT-09 (user d.reyes): PUA.Adware.BundleX quarantined automatically. No network contact beyond the vendor update server; no connection to 198.51.100.77."),
    rec("E-111", "n/a", "network", "30-day egress lookback for 198.51.100.77", "Internal hosts that contacted 198.51.100.77: exactly one, FIN-LT-07, first seen 01:15 today. No contact from FIN-LT-09, the ERP servers or the finance VLAN."),
    rec("E-112", "02:06:20", "identity", "Mailbox audit: inbox rule created", "In p.okafor's mailbox, rule 'fwd-inv' created: forward messages containing 'invoice' to ghost-collect@mailbox.example (external). Actor session: S-7F31. Source IP 198.51.100.77."),
    rec("E-113", "02:20", "endpoint", "EDR health snapshot FIN-LT-07", "No ransomware indicators, no credential dumping, no lateral movement attempts. Device online; volatile memory intact."),
    rec("E-114", "n/a", "identity", "d.reyes sign-in review", "d.reyes: normal sign-ins from registered FIN-LT-09 with fresh MFA; no anomalies."),
  ],
  tasks: [
    { id: "i1.classify", prompt: "Classify each observation. 'Suspicious' means unusual but not proven malicious; 'Confirmed compromise' needs direct evidence.", answer: "{ classifications: { [recordId]: 'benign' | 'suspicious' | 'compromise' } } for E-101, E-102, E-103, E-107, E-108, E-110", lists: { records: opts(["E-101", "E-101"], ["E-102", "E-102"], ["E-103", "E-103"], ["E-107", "E-107"], ["E-108", "E-108"], ["E-110", "E-110"]), classes: CLASSES } },
    { id: "i1.assets", prompt: "Select only the assets the evidence CONFIRMS as compromised. Selecting more than three assets forfeits the per-asset credit.", answer: "{ assets: string[] } (asset ids)", lists: { assets: opts(["as-12", "Account p.okafor"], ["as-27", "Laptop FIN-LT-07"], ["as-31", "Laptop FIN-LT-09"], ["as-44", "Account d.reyes"], ["as-58", "ERP production servers"], ["as-63", "Entire finance VLAN"]) } },
    { id: "i1.response", prompt: "Choose the immediate response. It must stop the attacker without disrupting authorized month-end work or destroying evidence.", answer: "{ actions: string[] } (action ids)", lists: { actions: opts(["rx-1", "Disable every account in the Finance department"], ["rx-2", "Revoke all active sessions and refresh tokens for p.okafor and force a credential reset with new MFA enrolment"], ["rx-3", "Wipe and reimage FIN-LT-07 immediately"], ["rx-4", "Block 198.51.100.77 at the egress proxy"], ["rx-5", "Shut down the finance VLAN for the rest of month-end close"], ["rx-6", "Isolate FIN-LT-07 from the network through the EDR, leaving it powered on"], ["rx-7", "Block 203.0.113.10 (LedgerBridge) until reviewed"], ["rx-8", "Force a password reset for every employee"]) } },
    { id: "i1.justify", prompt: "Select 3 to 5 records that, together, justify your compromise decision. Independent sources (identity, endpoint, network) corroborate; benign or unrelated records weaken your case.", answer: "{ evidenceIds: string[] } (3 to 5 record ids)", lists: { records: opts(...["E-101", "E-102", "E-103", "E-104", "E-105", "E-106", "E-107", "E-108", "E-109", "E-110", "E-111", "E-112", "E-113", "E-114"].map(id => [id, id] as [string, string])) } },
  ],
};

const incident2: Unit = {
  part: "A", unit: 2, title: "Kill Switch",
  story: "The network visualization shows ten connections. Exactly two are malicious. The rest are authorized, benign, or merely look alarming without being independently proven malicious. BLOCK actions here are simulations: nothing is executed. Selecting too many connections forfeits credit.",
  records: [
    rec("C-01", "02:00", "connection", "FIN-LT-07 to 203.0.113.10:443/TCP", "Out 210 MB, in 0.4 MB. Process ledger_sync.exe. Tagged CHG-5521."),
    rec("C-02", "02:02", "connection", "HR-APP-01 to 192.0.2.60:443/TCP", "Out 15 MB. Process payroll_export. Monthly job on the 5th; payroll provider."),
    rec("C-03", "01:15-02:14", "connection", "FIN-LT-07 to 198.51.100.77:443/TCP", "Out 38.2 MB, in 1.3 MB. Process chrome_ext_host.exe. No change record."),
    rec("C-04", "02:30", "connection", "BKP-SRV-02 to 192.0.2.200:22/TCP", "Out 480 GB (the largest on the map). Process backup-agent. Nightly offsite backup."),
    rec("C-05", "01:30", "connection", "192.0.2.150 to FW-EDGE:443/TCP (inbound)", "Action DROP. 0 bytes accepted. Threat-intel feed lists the source as a scanner."),
    rec("C-06", "02:10", "connection", "MON-AGENT-03 to 198.51.100.140:443/TCP", "Out 2.1 MB. Process mon-agent. Same hosting ASN (AS64500) as 198.51.100.77."),
    rec("C-07", "02:09", "connection", "192.0.2.88 to VPN-GW:443/TCP (inbound)", "In 3.4 MB. User p.okafor, MFA satisfied. Source in Lagos."),
    rec("C-08", "01:20-02:13", "connection", "FIN-LT-07 to 203.0.113.99:53/UDP", "38,900 TXT queries, 4.1 MB out. Process chrome_ext_host.exe."),
    rec("C-09", "02:00", "connection", "CI-RUN-05 to 192.0.2.230:443/TCP", "In 212 MB. Nightly build pulling packages. Scheduled."),
    rec("C-10", "02:15", "connection", "PRN-FLT-01 to 192.0.2.99:8883/TCP", "Out 40 KB. Printer fleet telemetry on an unusual port (MQTT-TLS). Tagged CHG-4480."),
    rec("N-201", "01:15-02:14", "network", "Beacon analytics for C-03", "Process chrome_ext_host.exe (unsigned) checks in every 300 s (+/- 3 s) with ~1.1 KB upstream, plus larger batches. No change record covers it."),
    rec("N-202", "02:14", "network", "TLS metadata for C-03", "198.51.100.77 presents a self-signed certificate (CN cdn-pdfviewer.example), domain registered 6 days ago. JA3 fingerprint equals chrome_ext_host.exe's handshake, not Chrome's."),
    rec("N-203", "01:20-02:13", "network", "DNS analytics for C-08", "38,900 TXT queries from FIN-LT-07 to 203.0.113.99 for *.u7.sync-update.example. Each query uses a unique 52-character base32 label. Domain registered 6 days ago."),
    rec("N-204", "01:20-02:13", "endpoint", "EDR file/process view for C-08", "chrome_ext_host.exe built a staging archive inv_export.zip (4.1 MB) from the mailbox invoice cache and read it in 60-byte chunks while the DNS queries ran."),
    rec("N-205", "n/a", "intel", "Threat-intel feed entry", "192.0.2.150 is listed as a high-confidence internet scanner. The feed says nothing about any successful connection to Meridian."),
    rec("N-206", "n/a", "intel", "ASN lookup", "198.51.100.140 and 198.51.100.77 are announced by the same hosting ASN (AS64500). The ASN has a low overall reputation. No other relationship is recorded."),
    rec("N-207", "n/a", "change", "Backup schedule BKP-9", "BKP-SRV-02 sends a nightly 480 GB encrypted backup at 02:30 to the contracted offsite provider."),
    rec("N-208", "02:09", "network", "VPN gateway log", "Inbound session from 192.0.2.88 for p.okafor on the registered FIN-LT-07; matches TRV-882."),
    rec("N-209", "n/a", "change", "Change CHG-4480", "Printer fleet telemetry over MQTT-TLS to 192.0.2.99:8883 approved for all PRN-FLT devices."),
    rec("N-210", "01:30-01:34", "network", "Firewall drop summary", "11 inbound packets from 192.0.2.150 were dropped at FW-EDGE; 0 bytes accepted."),
  ],
  tasks: [
    { id: "i2.identify", prompt: "Select the connections you judge malicious. Exactly two are. Selecting more than three forfeits the per-connection credit.", answer: "{ connectionIds: string[] }", lists: { connections: opts(...["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09", "C-10"].map(id => [id, id] as [string, string])) } },
    { id: "i2.evidence", prompt: "For each connection you identified, cite the records that independently prove it malicious. Do not cite records that merely describe other traffic.", answer: "{ evidence: { [connectionId]: string[] } } (exactly the connections you identified, at most 2 keys; up to 4 record ids each)", lists: { records: opts(...["N-201", "N-202", "N-203", "N-204", "N-205", "N-206", "N-207", "N-208", "N-209", "N-210"].map(id => [id, id] as [string, string])) } },
    { id: "i2.block", prompt: "Select the connections to BLOCK (simulation). Blocking more than three connections, or any legitimate one, is penalized.", answer: "{ blocks: string[] } (connection ids)", lists: { connections: opts(...["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09", "C-10"].map(id => [id, id] as [string, string])) } },
  ],
};

const incident3: Unit = {
  part: "A", unit: 3, title: "Audit the AI",
  story: "IR-Assist, an AI tool, produced an incident report with three claims. Exactly two are false. An AI report is a lead, not evidence: verify each claim against the primary sources.",
  records: [
    rec("AI-REPORT", "02:50", "ai-generated", "IR-Assist incident report (unverified; sources not cited)", "Claim A: The attacker gained access when Priya Okafor opened a phishing email at 01:41 and typed her password into a fake Meridian login page. Claim B: The attacker created a mailbox forwarding rule at 02:06 that sent invoice messages to an external address. Claim C: The 210 MB transfer from FIN-LT-07 to 203.0.113.10 at 02:00 was the attacker's data exfiltration."),
    rec("P-301", "00:00-02:15", "mail-gateway", "Mail gateway log for p.okafor", "Inbound external messages: 2, both newsletters from known senders. 0 flagged as phishing. 0 messages with credential-harvest links. No link click recorded at 01:41."),
    rec("P-302", "n/a", "identity", "SSO audit for p.okafor", "Last password verification: 2026-12-04 09:02 from registered FIN-LT-07. No password verification on 12-05 before 02:09. Session S-7F31 (02:05) was created by refresh-token replay."),
    rec("P-303", "01:12:07", "endpoint", "Extension install on FIN-LT-07", "'PDF Viewer Plus' sideloaded from a local CRX, unsigned, cookies + all-sites permissions."),
    rec("P-304", "n/a", "change", "Change CHG-5521", "Month-end ledger sync, FIN-LT-07, window 01:55-02:15 UTC, destination 203.0.113.10 only, approved by the Finance Controller."),
    rec("P-305", "02:00-02:11", "vendor", "LedgerBridge receipt attestation", "The 210 MB file received matches the SHA-256 of the output of the signed ledger_sync.exe. Received through the vendor's allow-listed endpoint."),
    rec("P-306", "n/a", "network", "Allow-list history", "203.0.113.10 has been on the approved-vendor allow-list since 2025. Previous month-end syncs were about 200 MB each."),
    rec("P-307", "02:06:20", "identity", "Mailbox audit", "Rule 'fwd-inv' created by session S-7F31 forwarding 'invoice' mail to ghost-collect@mailbox.example."),
    rec("P-308", "01:00-02:30", "erp", "ERP access audit", "No ERP sessions from 198.51.100.77, from session S-7F31 or from FIN-LT-07 service accounts."),
    rec("P-309", "n/a", "hr", "Travel record TRV-882", "p.okafor approved to work from Lagos 2026-12-04 to 2026-12-08."),
  ],
  tasks: [
    { id: "i3.verdicts", prompt: "Judge each claim of the AI report as true or false.", answer: "{ verdicts: { A: 'true'|'false', B: 'true'|'false', C: 'true'|'false' } }" },
    { id: "i3.contradictions", prompt: "For each claim you judged false, select up to 3 primary records that contradict it or establish the true alternative. Use only records that bear on that claim.", answer: "{ contradictions: { A: string[], C: string[] } } (record ids, up to 3 each)", lists: { records: opts(...["P-301", "P-302", "P-303", "P-304", "P-305", "P-306", "P-307", "P-308", "P-309"].map(id => [id, id] as [string, string])) } },
    { id: "i3.corrections", prompt: "For each false claim, choose the correct interpretation supported by the records.", answer: "{ corrections: { A: optionId, C: optionId } }", lists: { A: opts(["ca-1", "Prior password-spray success at 01:30 provided the initial access."], ["ca-2", "A sideloaded browser extension stole the live session token at 01:12-01:15; no password was typed and no phishing email was involved."], ["ca-3", "The approved Lagos sign-in was the intrusion."], ["ca-4", "A breach of the LedgerBridge vendor provided the credentials."]), C: opts(["cc-1", "The 210 MB transfer was the unauthorized exfiltration of the ERP database."], ["cc-2", "The 210 MB transfer was the authorized CHG-5521 ledger sync to the approved vendor; the exfiltration channels are the 38.2 MB HTTPS beacon and the 4.1 MB DNS tunnel."], ["cc-3", "The transfer was a decoy staged by the vendor."], ["cc-4", "The transfer volume cannot be explained from the records."]) } },
  ],
};

const incident4: Unit = {
  part: "A", unit: 4, title: "Executive Decision",
  story: "Leadership demands restoration of finance access before the 09:00 payment run. Choose proportionate containment, preserve evidence, communicate defensibly, define the recovery prerequisites, and put the restoration steps in a defensible order.",
  records: [
    rec("D-401", "03:05", "executive", "CFO message", "'The payment run for 214 suppliers starts at 09:00. Restore finance access now. Why is anything still blocked?'"),
    rec("D-402", "03:00", "ir-status", "IR status", "FIN-LT-07 isolated 02:41. Sessions for p.okafor revoked 02:41; credentials NOT yet reset and MFA NOT yet re-enrolled (a rule can be recreated by any still-valid token). Forwarding rule still active. Egress blocks for the attacker infrastructure not yet applied. FIN-LT-07 not yet imaged."),
    rec("D-403", "03:00", "forensics", "Forensic note", "Volatile memory of FIN-LT-07 holds the extension host process and staging buffers. A reimage destroys it. Imaging requires about 40 minutes."),
    rec("D-404", "03:10", "legal", "Privacy / legal note", "The stolen mailbox invoices may include supplier bank details; scope is not yet determined. Notification duties start on determination. No customer personal data is confirmed involved."),
    rec("D-405", "03:12", "finance-ops", "Finance operations note", "The payment run can proceed under other approvers from clean workstations if any bank-detail change is verified out of band. ERP is not compromised (see P-308). p.okafor's own payment-approval role is the only one affected."),
    rec("D-406", "03:15", "hr-comms", "Staff and vendor context", "Finance staff are asking whether to wipe their own laptops. LedgerBridge's feed is intact (see P-305). Journalists have not contacted Meridian."),
  ],
  tasks: [
    { id: "i4.contain", prompt: "Select the immediate containment decisions you will hold despite the pressure to restore.", answer: "{ actions: string[] }", lists: { actions: opts(["kx-1", "Keep FIN-LT-07 isolated until forensic imaging is complete"], ["kx-2", "Shut down ERP and every finance system company-wide"], ["kx-3", "Block 198.51.100.77, 203.0.113.99 and sync-update.example at egress and DNS"], ["kx-4", "Lift the isolation so p.okafor can finish month-end close"], ["kx-5", "Disable every finance user account"]) } },
    { id: "i4.preserve", prompt: "Select what must be preserved, and avoid anything that destroys evidence.", answer: "{ items: string[] }", lists: { items: opts(["vx-1", "Reimage FIN-LT-07 immediately and image it afterwards"], ["vx-2", "Disk image of FIN-LT-07"], ["vx-3", "Delete the forwarding rule before exporting its definition"], ["vx-4", "Memory image of FIN-LT-07"], ["vx-5", "Proxy/NDR, DNS and SSO audit exports for 00:00-03:00"], ["vx-6", "Mailbox audit export including the rule definition"], ["vx-7", "A full ERP database backup"]) } },
    { id: "i4.comms", prompt: "Choose one communication decision for each audience.", answer: "{ choices: { executives: optionId, staff: optionId, vendor: optionId, public: optionId } }", lists: {
      executives: opts(["mx-1", "Report confirmed facts and unknowns, recommend a phased restoration with prerequisites and an ETA"], ["mx-2", "Report all clear and restore now"], ["mx-3", "Report suspected company-wide ransomware"]),
      staff: opts(["ms-1", "Tell staff to wipe their own laptops"], ["ms-2", "Send nothing so as not to cause panic"], ["ms-3", "Tell staff not to act on their own, report unusual prompts, and verify bank-detail changes out of band"]),
      vendor: opts(["mv-1", "Cut the LedgerBridge feed and demand an audit"], ["mv-2", "Share the indicators and the authorized-transfer confirmation, ask them to verify receipt integrity, accuse no one"], ["mv-3", "Say nothing to the vendor"]),
      public: opts(["mp-1", "Announce a confirmed customer data breach"], ["mp-2", "Name the threat actor publicly"], ["mp-3", "No public statement now; prepare a holding statement for legal review"]) } },
    { id: "i4.prereq", prompt: "Select the conditions that must be true before access is restored.", answer: "{ items: string[] }", lists: { items: opts(["qx-1", "Wait a fixed 72 hours"], ["qx-2", "Credentials reset, MFA re-enrolled and sessions revoked"], ["qx-3", "Executive sign-off alone"], ["qx-4", "FIN-LT-07 rebuilt (after imaging) with the malicious extension gone"], ["qx-5", "Replace every finance laptop"], ["qx-6", "Forwarding rule removed and attacker infrastructure blocked"]) } },
    { id: "i4.sequence", prompt: "Order ALL six steps from first to last. Dependencies matter.", answer: "{ order: string[] } (a permutation of all six step ids)", lists: { steps: opts(["sq-1", "Rebuild FIN-LT-07 and remove the extension"], ["sq-2", "Re-enable p.okafor's payment-approval role after an out-of-band verification"], ["sq-3", "Remove the attacker forwarding rule (export it first) and apply the egress blocks"], ["sq-4", "Image FIN-LT-07 (memory, then disk)"], ["sq-5", "Reset p.okafor's credentials, re-enrol MFA and re-revoke any new sessions"], ["sq-6", "Restore p.okafor's access on the rebuilt device"]) } },
  ],
};

// ---------- PART B: DIGITAL TRIBUNAL ----------
const tribunalNew = [
  rec("T-501", "21:24:10 (ERP clock, US-Eastern, 2026-12-04)", "erp", "Denied ERP request", "Session S-7F31 requested a supplier bank-detail change. Denied: role missing."),
  rec("T-502", "02:00-02:20", "endpoint", "Input telemetry on FIN-LT-07", "Foreground ledger-application activity from the local user during 02:00-02:20 is normal bookkeeping. chrome_ext_host.exe made network connections with no foreground interaction."),
  rec("T-503", "02:00-03:00", "vendor", "LedgerBridge integrity attestation", "No foreign access to the vendor environment. The only session came from the approved API key bound to 203.0.113.10. File hashes intact."),
  rec("T-504", "n/a", "correlation", "Timeline correlation", "First beacon to 198.51.100.77: 01:15 UTC. First LedgerBridge traffic: 01:55-02:00 UTC. Replay sign-in: 02:05 UTC. The attacker channel began about 40 minutes before any vendor traffic."),
  rec("T-505", "n/a", "legal", "Legal / privacy memo", "Scope of the stolen invoices is not yet determined; supplier invoice PDFs may include bank details. No customer personal data is confirmed. Regulator notification is decided after the scope assessment. Supplier notification follows the scope assessment."),
  rec("T-508", "n/a", "endpoint", "Extension store check", "'PDF Viewer Plus' is not present in the managed extension store; publisher unverified; the local CRX is unsigned."),
  rec("T-509", "00:00-03:00", "database", "Customer database audit", "0 queries to the customer database or CRM from the incident sessions or from FIN-LT-07. Total outbound to the attacker channels: 38.2 MB (HTTPS) + 4.1 MB (DNS) = 42.3 MB."),
];
const evidencePool = (ids: string[]) => opts(...ids.map(id => [id, id] as [string, string]));
const CLOCKS = "Source clock reference: EDR logs use Lagos local time (UTC+1). The NDR sensor clock runs 6 minutes AHEAD of UTC. Mailbox and ERP audit logs use US-Eastern (UTC-5). SSO, DNS, SOAR and change records use UTC.";
const tl = (id: string, logged: string, source: string, text: string): R2Record => rec(id, logged, source, text, "");

const challenge1: Unit = {
  part: "B", unit: 1, title: "Reconstruct the Incident",
  story: `Build an evidence-backed causal timeline. Eleven events were logged by sources on different clocks. Three of them are NOT part of the attacker's causal chain. ${CLOCKS}`,
  records: [
    tl("EV-47", "02:12:07 (EDR, UTC+1)", "endpoint", "Browser extension 'PDF Viewer Plus' sideloaded on FIN-LT-07"),
    tl("EV-18", "01:21 (NDR, +6 min skew)", "network", "First check-in from FIN-LT-07 to 198.51.100.77:443"),
    tl("EV-63", "01:20:00 (DNS, UTC)", "network", "First DNS TXT query to *.u7.sync-update.example from FIN-LT-07"),
    tl("EV-32", "01:30 (SSO, UTC)", "identity", "Failed sign-in burst from 192.0.2.150 against 9 finance accounts"),
    tl("EV-75", "03:00:30 (change record, UTC+1)", "change", "Transfer of the ledger file to LedgerBridge starts (CHG-5521)"),
    tl("EV-21", "02:05:41 (SSO, UTC)", "identity", "Sign-in as p.okafor from 198.51.100.77 by refresh-token replay"),
    tl("EV-56", "21:06:20 on 2026-12-04 (mailbox audit, UTC-5)", "identity", "Inbox rule 'fwd-inv' created forwarding invoices externally"),
    tl("EV-84", "02:09 (SSO, UTC)", "identity", "p.okafor signs in from Lagos on FIN-LT-07 with MFA"),
    tl("EV-39", "02:20:03 (NDR, +6 min skew)", "network", "NDR raises 'Finance laptop outbound anomaly'"),
    tl("EV-92", "21:24:10 on 2026-12-04 (ERP audit, UTC-5)", "erp", "S-7F31 requests a supplier bank-detail change; denied"),
    tl("EV-14", "02:41 (SOAR, UTC)", "response", "Sessions revoked and FIN-LT-07 isolated"),
    ...tribunalNew,
  ],
  tasks: [
    { id: "b1.chain", prompt: "Select the events that belong to the attacker's causal chain (cause, enabling step, attacker action, detection or response).", answer: "{ eventIds: string[] }", lists: { events: evidencePool(["EV-47", "EV-18", "EV-63", "EV-32", "EV-75", "EV-21", "EV-56", "EV-84", "EV-39", "EV-92", "EV-14"]) } },
    { id: "b1.order", prompt: "Order ALL eleven events from earliest to latest in real (UTC) time. Normalize the clocks first.", answer: "{ order: string[] } (a permutation of all eleven event ids)", lists: { events: evidencePool(["EV-47", "EV-18", "EV-63", "EV-32", "EV-75", "EV-21", "EV-56", "EV-84", "EV-39", "EV-92", "EV-14"]) } },
    { id: "b1.root", prompt: "Name the root cause, the attacker's first action as an authenticated Meridian user, and the dwell time from the root cause to the 2:14 AM alert (UTC).", answer: "{ vector: optionId, firstAction: eventId, dwell: optionId }", lists: {
      vector: opts(["vc-1", "Phishing email with credential entry"], ["vc-2", "Sideloaded malicious browser extension stealing the live session"], ["vc-3", "Successful password spray"], ["vc-4", "Compromise of the LedgerBridge vendor"]),
      firstAction: evidencePool(["EV-47", "EV-18", "EV-63", "EV-32", "EV-21", "EV-56"]),
      dwell: opts(["dw-1", "About 15 minutes"], ["dw-2", "About 35 minutes"], ["dw-3", "About 62 minutes"], ["dw-4", "About 95 minutes"]) } },
  ],
};

const POOL2 = ["E-101", "E-102", "E-103", "E-105", "E-106", "E-107", "E-108", "P-302", "P-305", "T-502", "T-503", "T-504"];
const challenge2: Unit = {
  part: "B", unit: 2, title: "Challenge the Alternative",
  story: "Four explanations compete. H1: credential phishing or password spray gave the attacker a password. H2: the employee, p.okafor, is a malicious insider. H3: the LedgerBridge vendor was compromised and used to reach Meridian. H4: a malicious browser extension stole the live session. Part A records remain available.",
  records: [...tribunalNew],
  tasks: [
    { id: "b2.best", prompt: "Choose the explanation the primary evidence supports and select 2 to 4 records that independently support it.", answer: "{ best: 'H1'|'H2'|'H3'|'H4', supportIds: string[] }", lists: { records: evidencePool(POOL2) } },
    { id: "b2.eliminate", prompt: "Eliminate H1, H2 and H3. For each, select up to 3 records whose contradiction defeats it. Selecting a record that does not contradict it weakens the elimination.", answer: "{ eliminate: { H1: string[], H2: string[], H3: string[] } }", lists: { records: evidencePool(POOL2) } },
  ],
};

const challenge3: Unit = {
  part: "B", unit: 3, title: "Expose the False Intelligence",
  story: "A commercial intelligence bulletin (sources not cited) circulates about the incident. Some items are accurate, some false, one cannot be established from the evidence. Verify independently; do not trust the vendor's confidence labels.",
  records: [
    rec("INT-1", "n/a", "bulletin", "Attribution", "198.51.100.77 belongs to the 'GHOST' group. Confidence: HIGH."),
    rec("INT-2", "n/a", "bulletin", "Extension", "'PDF Viewer Plus' is a vendor-signed, store-verified extension; installing it was safe."),
    rec("INT-3", "n/a", "bulletin", "DNS domain", "sync-update.example was registered 6 days ago and was used for DNS tunnelling."),
    rec("INT-4", "n/a", "bulletin", "Impact", "Attackers exfiltrated the complete 2.3 GB customer database."),
    rec("INT-5", "n/a", "bulletin", "Lagos sign-in", "The 02:09 Lagos sign-in was attacker traffic through a VPN exit node."),
    rec("INT-6", "n/a", "bulletin", "Beacon cadence", "A 300-second check-in cadence is consistent with the malicious extension's behaviour."),
    ...tribunalNew,
  ],
  tasks: [
    { id: "b3.classify", prompt: "Grade each bulletin item against the evidence: accurate, false, or unverifiable from the evidence available.", answer: "{ grades: { [INT-n]: 'accurate'|'false'|'unverifiable' } } for INT-1..INT-6", lists: { items: evidencePool(["INT-1", "INT-2", "INT-3", "INT-4", "INT-5", "INT-6"]) } },
    { id: "b3.verify", prompt: "Give an independently verifiable correction: for INT-2, INT-4 and INT-5 choose the single record that best refutes it; for INT-1 choose the limitation that applies.", answer: "{ refutations: { 'INT-2': recordId, 'INT-4': recordId, 'INT-5': recordId }, attributionLimit: optionId }", lists: { records: evidencePool(["E-102", "E-103", "E-104", "E-105", "E-107", "E-111", "P-308", "T-508", "T-509"]), attributionLimit: opts(["al-1", "IP geolocation proves the country and therefore the operator."], ["al-2", "A commercial feed is authoritative because it is paid for."], ["al-3", "One IP on shared hosting plus an uncited assertion does not establish who operates it; no corroborating infrastructure or tooling evidence exists."], ["al-4", "Attribution requires a confession from the actor."]) } },
  ],
};

const challenge4: Unit = {
  part: "B", unit: 4, title: "Final Command Decision",
  story: "Assemble the final response brief from structured decisions: confirmed facts, attribution limits, the response plan and the communication decisions. Optional notes are for humans only and are not graded.",
  records: [...tribunalNew],
  tasks: [
    { id: "b4.facts", prompt: "Select only the statements the evidence CONFIRMS as incident facts.", answer: "{ factIds: string[] }", lists: { facts: opts(
      ["fx-1", "FIN-LT-07 was compromised by a sideloaded browser extension at 01:12 UTC."], ["fx-2", "p.okafor acted as a malicious insider."], ["fx-3", "A refresh-token replay session from 198.51.100.77 signed in as p.okafor at 02:05 UTC without MFA."],
      ["fx-4", "The ERP database was exfiltrated."], ["fx-5", "A forwarding rule sent invoice mail to an external address from 02:06 UTC."], ["fx-6", "The GHOST group is the confirmed actor."],
      ["fx-7", "Two attacker channels left FIN-LT-07: a 38.2 MB HTTPS beacon and a 4.1 MB DNS tunnel."], ["fx-8", "LedgerBridge was breached."], ["fx-9", "The 210 MB LedgerBridge transfer was authorized under CHG-5521."], ["fx-10", "Customer personal data was confirmed stolen."]) } },
    { id: "b4.attribution", prompt: "State the attribution level the evidence allows and select the reasons that limit it.", answer: "{ level: optionId, reasons: string[] }", lists: {
      level: opts(["at-1", "Confirmed: a named state actor"], ["at-2", "Likely: a named criminal crew"], ["at-3", "Unattributed: indicators only, no actor identified"], ["at-4", "Confirmed: an insider"]),
      reasons: opts(["ar-1", "The infrastructure is shared hosting (AS64500) with unrelated tenants."], ["ar-2", "The feed vendor labelled its claim high confidence."], ["ar-3", "The tooling is a commodity extension and no unique technique overlap is evidenced."], ["ar-4", "The domain was registered recently, so a state must be behind it."], ["ar-5", "No infrastructure or code link is evidenced beyond the bulletin's assertion."]) } },
    { id: "b4.plan", prompt: "Choose one option for each: containment, evidence preservation and recovery gating.", answer: "{ containment: optionId, preservation: optionId, recovery: optionId }", lists: {
      containment: opts(["pc-1", "Isolate the entire finance VLAN until the investigation ends"], ["pc-2", "Keep FIN-LT-07 isolated, block the three attacker indicators, keep ERP and approved jobs running"], ["pc-3", "Lift isolation so the close can finish"]),
      preservation: opts(["pp-1", "Image memory then disk and export the SSO, proxy, DNS and mailbox logs before any reimage"], ["pp-2", "Reimage first to remove the extension, image later"], ["pp-3", "Preserve nothing; the incident is contained"]),
      recovery: opts(["pr-1", "Restore after 72 hours"], ["pr-2", "Restore once the CFO approves"], ["pr-3", "Restore only after credentials are reset with new MFA, the rule is removed, indicators are blocked and the device is rebuilt after imaging"]) } },
    { id: "b4.comms", prompt: "Decide the communication timing for the regulator and for suppliers.", answer: "{ regulator: optionId, suppliers: optionId, note?: string (max 500 chars, context only, never graded) }", lists: {
      regulator: opts(["cr-1", "Notify now as a confirmed personal-data breach"], ["cr-2", "Prepare the notice; hold until the scope assessment determines whether notification is required"], ["cr-3", "Never notify"]),
      suppliers: opts(["cs-1", "Notify all suppliers immediately of confirmed bank-detail theft"], ["cs-2", "Notify affected suppliers after the scope assessment determines whose details were exposed"], ["cs-3", "Notify no one"]) } },
  ],
};

export const units: readonly Unit[] = [incident1, incident2, incident3, incident4, challenge1, challenge2, challenge3, challenge4];
