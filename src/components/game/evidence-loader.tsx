"use client";
// Round 1 evidence is fetched from the authenticated, no-store chapter APIs AFTER the page loads, instead of being passed as a
// Server Component prop (which Next.js serializes into the initial HTML / Flight payload, i.e. View Source).
// The desks themselves are unchanged: they receive exactly the same `evidence` objects as before.
import { useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { InboxDesk } from "./inbox-desk";
import { TrailDesk } from "./trail-desk";
import { ContainmentDesk } from "./containment-desk";
import { VerdictDesk } from "./verdict-desk";

function useEvidence<T>(url: string) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) { router.replace("/login"); return; }
        if (response.status === 403) { router.replace("/play"); return; }
        if (!response.ok) throw new Error(String(response.status));
        const json = await response.json() as T;
        if (alive) { setData(json); setError(""); }
      } catch { if (alive) { setError("Unable to load the case evidence. Retrying…"); timer = setTimeout(load, 4000); } }
    }
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [url, router]);
  return { data, error };
}

function Loading({ error }: { error: string }) {
  return <p role="status" className={`k-banner ${error ? "k-banner-warn" : "k-banner-ok"}`}>{error || "Loading case evidence…"}</p>;
}

type Inbox = ComponentProps<typeof InboxDesk>;
export function InboxDeskLoader(props: Omit<Inbox, "evidence">) {
  const { data, error } = useEvidence<{ evidence: Inbox["evidence"] }>("/api/game/inbox");
  return data ? <InboxDesk {...props} evidence={data.evidence} /> : <Loading error={error} />;
}

type Trail = ComponentProps<typeof TrailDesk>;
export function TrailDeskLoader(props: Omit<Trail, "evidence">) {
  const { data, error } = useEvidence<Trail["evidence"]>("/api/game/trail"); // this existing route returns the evidence object itself
  return data ? <TrailDesk {...props} evidence={data} /> : <Loading error={error} />;
}

type Containment = ComponentProps<typeof ContainmentDesk>;
export function ContainmentDeskLoader(props: Omit<Containment, "evidence" | "cctv">) {
  const { data, error } = useEvidence<{ evidence: Containment["evidence"]; cctv: Containment["cctv"] }>("/api/game/containment");
  return data ? <ContainmentDesk {...props} evidence={data.evidence} cctv={data.cctv} /> : <Loading error={error} />;
}

type Verdict = ComponentProps<typeof VerdictDesk>;
export function VerdictDeskLoader(props: Omit<Verdict, "evidence">) {
  const { data, error } = useEvidence<{ evidence: Verdict["evidence"] }>("/api/game/verdict");
  return data ? <VerdictDesk {...props} evidence={data.evidence} /> : <Loading error={error} />;
}
