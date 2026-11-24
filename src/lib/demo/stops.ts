/* Ordered demo stops (plain module: imported by both the server pages and the client toolbar). */
const R1 = [["inbox", "1 · Inbox"], ["trail", "2 · Trail"], ["insider", "3 · Insider"], ["containment", "4 · Containment"], ["verdict", "5 · Final Verdict"]] as const;
const R2 = [["1", "1 · Alert at 2:14 AM"], ["2", "2 · Kill Switch"], ["3", "3 · Audit the AI"], ["4", "4 · The Three Calls"]] as const;
export const DEMO_STOPS: { href: string; label: string; group: string }[] = [
  { href: "/admin/demo", label: "Demo home", group: "Home" },
  { href: "/admin/demo/round1", label: "Round 1 dashboard", group: "Round 1" },
  ...R1.map(([slug, label]) => ({ href: `/admin/demo/round1/${slug}`, label, group: "Round 1" })),
  ...R2.map(([unit, label]) => ({ href: `/admin/demo/round2?unit=${unit}`, label, group: "Round 2" })),
];

