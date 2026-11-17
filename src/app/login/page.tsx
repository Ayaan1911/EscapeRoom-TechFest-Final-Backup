import { Brand } from "@/components/ui/brand";
import { signIn } from "./actions";

const NEXT = ["/clue/inbox", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"];

// Participant login only. Any ?role= parameter is ignored: this page always authenticates a team.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = NEXT.includes(params.next ?? "") ? params.next : "";
  return <div className="site-shell">
    <header className="site-header"><Brand /></header>
    <main className="dashboard-main">
      <div className="lp-login">
        <section className="lp-login-aside" aria-label="About this sign-in">
          <span className="k-eyebrow">SECURE ACCESS</span>
          <h2>Your case is waiting.</h2>
          <p>Sign in with the team ID and access code from your organizer. Progress, hints and your timer are saved on the server, so a refresh or a lost connection never loses work.</p>
          <ul className="lp-checks"><li>Never share your access code outside your team.</li><li>Use the HTTPS address your organizer gave you.</li></ul>
        </section>
        <section className="k-card lp-login-card">
          <div className="k-card-body">
            <h1>Team login</h1>
            <p className="k-muted">Use the team ID and access code supplied by your organizer.</p>
            {params.error && <p role="alert" className="k-banner k-banner-warn">Access denied. Check your details or try again later.</p>}
            <form action={signIn} className="k-form">
              {next && <input type="hidden" name="next" value={next} />}
              <label>Team ID<input name="id" required maxLength={80} autoComplete="username" autoCapitalize="characters" spellCheck={false} /></label>
              <label>Access code<input type="password" name="code" required minLength={12} maxLength={256} autoComplete="current-password" /></label>
              <button className="k-btn k-btn-primary k-btn-lg">Sign in</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
