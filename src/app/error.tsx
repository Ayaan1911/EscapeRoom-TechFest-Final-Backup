"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <main className="state-screen" role="alert"><span className="eyebrow">SYSTEM NOTICE / NX-404</span><h1>Workspace unavailable</h1><p>Something interrupted this view. Try loading it again.</p><button className="button-primary" onClick={reset}>Try again ↗</button></main>;
}
