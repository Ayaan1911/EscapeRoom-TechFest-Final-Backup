import { Brand } from "@/components/ui/brand";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ role?: string; error?: string; next?: string }> }) {
  const params = await searchParams;
  const admin = params.role === "admin";
  const next = ["/clue/inbox", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"].includes(params.next ?? "") ? params.next : "";
  return <div className="site-shell">
    <header className="site-header"><Brand /></header>
    <main className="dashboard-main">
      <div className="lp-login">
        <section className="lp-login-aside" aria-label="About this sign-in">
          <span className="k-eyebrow">SECURE ACCESS</span>
          <h2>{admin ? "Run the event." : "Your case is waiting."}</h2>
          <p>{admin ? "Start and stop the round, print the physical kits and review the leaderboard. Organizer access is separate from team access, and you can stay signed in to both at once." : "Sign in with the team ID and access code from your organizer. Progress, hints and your timer are saved on the server, so a refresh or a lost connection never loses work."}</p>
          <ul className="lp-checks"><li>Never share your access code outside your team.</li><li>{admin ? "Sign out on shared computers when you are done." : "Use the HTTPS address your organizer gave you."}</li></ul>
        </section>
        <section className="k-card lp-login-card">
          <div className="k-card-body">
            <nav className="k-seg" aria-label="Sign-in type"><a href="/login" aria-current={admin ? undefined : "page"}>Team access</a><a href="/login?role=admin" aria-current={admin ? "page" : undefined}>Organizer access</a></nav>
            <h1>{admin ? "Organizer login" : "Team login"}</h1>
            <p className="k-muted">Use the access details supplied by your organizer.</p>
            {params.error && <p role="alert" className="k-banner k-banner-warn">Access denied. Check your details or try again later.</p>}
            <form action={signIn} className="k-form">
              {next && <input type="hidden" name="next" value={next} />}
              <input type="hidden" name="role" value={admin ? "admin" : "team"} />
              {!admin && <label>Team ID<input name="id" required maxLength={80} autoComplete="username" autoCapitalize="characters" spellCheck={false} /></label>}
              {admin && <input type="hidden" name="id" value="organizer" />}
              <label>Access code<input type="password" name="code" required minLength={12} maxLength={256} autoComplete="current-password" /></label>
              <button className="k-btn k-btn-primary k-btn-lg">Sign in</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
