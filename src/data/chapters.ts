import type { Chapter } from "@/types/game";

export const chapters = [
  { id: "inbox", number: "01", title: "Inbox", focus: "Phishing investigation" },
  { id: "trail", number: "02", title: "Trail", focus: "Login-log analysis" },
  { id: "insider", number: "03", title: "Insider", focus: "Suspect investigation" },
  { id: "containment", number: "04", title: "Containment", focus: "Attack reconstruction" },
] as const satisfies readonly Chapter[];
