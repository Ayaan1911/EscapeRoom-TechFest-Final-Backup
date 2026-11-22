import "../../../round2.css";
import { Round2Shell } from "@/components/round2/shell";
import { demoRound2, requireDemoAdmin } from "@/lib/demo/demo.server";

const UNITS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
/** Organizer preview of Round 2: all eight units released and open, no clock, no enrollment, no network writes. */
export default async function DemoRound2Page({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  await requireDemoAdmin();
  const unit = (await searchParams).unit, { status, bundle } = demoRound2();
  return <main className="dashboard-main"><Round2Shell teamName="Demonstration team" initialStatus={status} initialDrafts={[]} demo={{ bundle, unit: UNITS.includes(unit ?? "") ? unit : "A1" }} /></main>;
}
