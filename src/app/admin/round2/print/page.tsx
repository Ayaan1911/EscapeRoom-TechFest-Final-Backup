import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { DOCS } from "./docs";
import { DOCS_V2 } from "./docs-v2";
import "../../../paper.css";

export const dynamic = "force-dynamic";
export default async function PrintIndex() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="pp-index"><h1>Round 2 printable materials</h1><p>Open a document, then use the browser&apos;s Print. All pages are organizer-only.</p><h2>40-minute format (current default)</h2><ul>{DOCS.map(d => <li key={d.slug}><a href={`/admin/round2/print/${d.slug}`}>{d.title}</a> <span>{d.note}</span></li>)}</ul><h2>60-minute open-inject format (case document v2)</h2><ul>{DOCS_V2.map(d => <li key={d.slug}><a href={`/admin/round2/print/${d.slug}`}>{d.title}</a> <span>{d.note}</span></li>)}</ul><p><a href="/admin/round2">← Round 2 control room</a></p></main>;
}
