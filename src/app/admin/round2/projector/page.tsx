import { redirect } from "next/navigation";

// One projector for the whole event: the broadcast picks the Round 2 scenes from server state. Old links keep working.
export default function Round2ProjectorPage() { redirect("/admin/projector"); }
