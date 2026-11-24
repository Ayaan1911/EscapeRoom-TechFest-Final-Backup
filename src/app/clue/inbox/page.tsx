import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { teamState } from "@/lib/game/service";
import { inboxEvidence } from "@/lib/game/inbox.server";
import { SnapshotView } from "@/components/game/snapshot-view";

/** Chapter 1 forensic snapshot: opened by the in-app "Open Forensic Snapshot" button. Team session required; no printed QR or phone is needed. */
export default async function InboxSnapshotPage() {
  const auth = await session("team");
  if (!auth?.teamId) redirect("/login?next=/clue/inbox");
  const state = await teamState(auth.teamId);
  if (state.status === "waiting") redirect("/play");
  return <SnapshotView snapshot={inboxEvidence(state.variant).snapshot} back="/play/inbox" />;
}
