import { Brand } from "./brand";

/**
 * GHOST//OS system bar. One header for every screen so the product reads as a single operating system:
 * brand, the application the player is in, a secure-session indicator and the page's own actions (log out, back, ...).
 * Server component, no state and no data fetching: it never reveals anything a page has not already authorized.
 */
export function OsHeader({ area, secure = true, children }: { area: string; secure?: boolean; children?: React.ReactNode }) {
  return <header className="site-header os-bar">
    <Brand />
    <div className="os-ctx" aria-label="Current application">
      <span className="os-chip">GHOST//OS</span>
      <span className="os-area">{area}</span>
      {secure && <span className="os-secure"><i aria-hidden="true" />Secure session</span>}
    </div>
    <div className="os-actions">{children}</div>
  </header>;
}
