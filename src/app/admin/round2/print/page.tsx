import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { DOCS } from "@/components/round2/paper/print-docs";
import "../../../paper.css";

export const dynamic = "force-dynamic";
export default async function PrintIndex() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="pp-index"><h1>Round 2 printable materials</h1><p>Open a document, then use the browser&apos;s Print. All pages are organizer-only.</p><ul>{DOCS.map(d => <li key={d.slug}><a href={`/admin/round2/print/${d.slug}`}>{d.title}</a> <span>{d.note}</span></li>)}</ul><p><a href="/admin/round2">← Round 2 control room</a></p></main>;
}
