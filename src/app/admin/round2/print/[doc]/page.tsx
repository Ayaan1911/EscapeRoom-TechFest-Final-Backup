import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { AnswerKey, AnswerSheet, RubricA, RubricB, ScoreSheet, Script } from "../docs";
import { AnswerSheetV2, KeyV2, ScriptV2 } from "../docs-v2";
import "../../../../paper.css";

export const dynamic = "force-dynamic";
const VIEWS = { "answer-sheet": AnswerSheet, key: AnswerKey, "rubric-a": RubricA, "rubric-b": RubricB, "score-sheet": ScoreSheet, script: Script, "v2-answer-sheet": AnswerSheetV2, "v2-key": KeyV2, "v2-script": ScriptV2 } as const;
// Organizer-only printable documents. The answer key is rendered server-side only after the admin session is verified, and never ships in a client bundle.
export default async function PrintDoc({ params }: { params: Promise<{ doc: string }> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const { doc } = await params;
  if (!Object.hasOwn(VIEWS, doc)) notFound();
  const View = VIEWS[doc as keyof typeof VIEWS];
  return <main className="pp"><p className="pp-noprint"><Link href="/admin/round2/print">← All documents</Link> · <span className="pp-hint">Use Ctrl+P to print</span></p><View /></main>;
}
