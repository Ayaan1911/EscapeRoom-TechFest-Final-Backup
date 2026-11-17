import { Brand } from "@/components/ui/brand";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ role?: string; error?: string; next?: string }> }) {
  const params = await searchParams;
  const admin = params.role === "admin";
  const next = ["/clue/inbox", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"].includes(params.next ?? "") ? params.next : "";
  return <div className="site-shell"><header className="site-header"><Brand /></header><main className="dashboard-main"><section className="panel login-panel"><span className="eyebrow">SECURE ACCESS</span><h1>{admin ? "Organizer login" : "Team login"}</h1><p>Use the access details supplied by your organizer.</p>{params.error && <p role="alert">Access denied. Check your details or try again later.</p>}<form action={signIn}>{next && <input type="hidden" name="next" value={next} />}<input type="hidden" name="role" value={admin ? "admin" : "team"} />{!admin && <label>Team ID<input name="id" required maxLength={80} autoComplete="username" /></label>}{admin && <input type="hidden" name="id" value="organizer" />}<label>Access code<input type="password" name="code" required minLength={12} maxLength={256} autoComplete="current-password" /></label><button className="button-primary">Sign in</button></form><a className="back-link" href={admin ? "/login" : "/login?role=admin"}>{admin ? "Team access" : "Organizer access"}</a></section></main></div>;
}
