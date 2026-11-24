import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { AnswerSheetV2, KeyV2, ScoreSheet60, ScriptV2, TerminalResults, VolunteerSlips } from "../docs-v2";
import "../../../../paper.css";

export const dynamic = "force-dynamic";
const VIEWS = { "answer-sheet": AnswerSheetV2, key: KeyV2, slips: VolunteerSlips, terminal: TerminalResults, "score-sheet": ScoreSheet60, script: ScriptV2 } as const;
// Organizer-only printable documents. Keys, slips and scores are rendered server-side only after the admin session is verified.
export default async function PrintDoc({ params }: { params: Promise<{ doc: string }> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const { doc } = await params;
  if (!Object.hasOwn(VIEWS, doc)) notFound();
  const View = VIEWS[doc as keyof typeof VIEWS];
  return <main className="pp"><p className="pp-noprint"><Link href="/admin/round2/print">← All documents</Link> · <span className="pp-hint">Use Ctrl+P to print</span></p><View /></main>;
}
