import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Operation Ghost 404 home">
      <span className="brand-mark" aria-hidden="true">G<span>_</span></span>
      <span className="brand-copy"><strong>OPERATION GHOST_404</strong><small>NEXUS INCIDENT RESPONSE</small></span>
    </Link>
  );
}
