import { redirect } from "next/navigation";
import { PasswordField } from "@/components/ui/password-field";
import { OsHeader } from "@/components/ui/os-header";
import { session } from "@/lib/auth";
import { signInOrganizer } from "./actions";

export default async function OrganizerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await session("admin")) redirect("/admin");
  const params = await searchParams;
  return <div className="site-shell">
    <OsHeader area="Organizer access" secure={false} />
    <main className="dashboard-main">
      <div className="lp-login">
        <section className="lp-login-aside" aria-label="About organizer access">
          <span className="k-eyebrow">ORGANIZER ACCESS</span>
          <h2>Run the event.</h2>
          <p>Start and stop the round, print the physical kits and review the leaderboard. Organizer access is separate from team access, so you can stay signed in to both in one browser.</p>
          <ul className="lp-checks"><li>Never share the organizer code with participants.</li><li>Sign out on shared computers when you are done.</li></ul>
        </section>
        <section className="k-card lp-login-card">
          <div className="k-card-body">
            <h1>Organizer login</h1>
            <p className="k-muted">Enter the organizer access code.</p>
            {params.error && <p role="alert" className="k-banner k-banner-warn">Access denied. Check the code or try again later.</p>}
            <form action={signInOrganizer} className="k-form">
              <PasswordField label="Access code" name="code" required minLength={12} maxLength={256} />
              <button className="k-btn k-btn-primary k-btn-lg">Sign in</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
