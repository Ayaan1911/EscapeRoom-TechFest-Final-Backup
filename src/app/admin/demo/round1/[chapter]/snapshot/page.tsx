import { notFound } from "next/navigation";
import { SnapshotView } from "@/components/game/snapshot-view";
import { pickVariant, requireDemoAdmin } from "@/lib/demo/demo.server";
import { inboxEvidence } from "@/lib/game/inbox.server";

/** Organizer preview of the Chapter 1 forensic snapshot (sample variant; nothing is read from or written to a team). */
export default async function DemoSnapshot({ params, searchParams }: { params: Promise<{ chapter: string }>; searchParams: Promise<{ v?: string }> }) {
  await requireDemoAdmin();
  if ((await params).chapter !== "inbox") notFound();
  const v = pickVariant((await searchParams).v);
  return <SnapshotView snapshot={inboxEvidence(v).snapshot} back={`/admin/demo/round1/inbox?v=${v}`} demo />;
}
