import { OsHeader } from "@/components/ui/os-header";
import { PasswordField } from "@/components/ui/password-field";
import { signIn } from "./actions";
import { SignInButton } from "@/components/ui/sign-in-button";

const NEXT = ["/round2", "/clue/inbox", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"];

// Participant login only. Any ?role= parameter is ignored: this page always authenticates a team.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = NEXT.includes(params.next ?? "") ? params.next : "";
  return <div className="site-shell cn-login">
    <OsHeader area="Secure access" secure={false} />
    <main className="dashboard-main">
      <div className="lp-login cn-scene cn-access">
        <section className="lp-login-aside cn-status" aria-label="About this sign-in">
          <div className="cn-radar-lg" aria-hidden="true"><i /><i /><i /><b /></div>
          <span className="k-eyebrow">SECURE ACCESS</span>
          <h2>Your case is waiting.</h2>
          <p>Sign in with the team ID and access code from your organizer. Progress, hints and your timer are saved on the server, so a refresh or a lost connection never loses work.</p>
          <dl className="cn-readout" aria-hidden="true"><div><dt>SESSION</dt><dd>UNAUTHENTICATED</dd></div><div><dt>CHANNEL</dt><dd>HOST-ONLY COOKIE</dd></div><div><dt>CLOCK</dt><dd>SERVER AUTHORITATIVE</dd></div></dl>
          <ul className="lp-checks"><li>Never share your access code outside your team.</li><li>Use the HTTPS address your organizer gave you.</li></ul>
        </section>
        <section className="k-card lp-login-card os-window cn-term">
          <div className="os-titlebar" aria-hidden="true"><i /><i /><i /><span>ghost-os://secure-access</span></div>
          <div className="k-card-body">
            <h1>Team login</h1>
            <p className="k-muted">Use the team ID and access code supplied by your organizer.</p>
            {params.error && <p role="alert" className="k-banner k-banner-warn">Access denied. Check your details or try again later.</p>}
            <form action={signIn} className="k-form">
              {next && <input type="hidden" name="next" value={next} />}
              <label>Team ID<input name="id" required maxLength={80} autoComplete="username" autoCapitalize="characters" spellCheck={false} /></label>
              <PasswordField label="Access code" name="code" required minLength={12} maxLength={256} />
              <SignInButton />
            </form>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
