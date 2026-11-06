import { Logo } from "@/components/Logo";

/** Same page for "doesn't exist" and "not yours", so it never confirms which servers exist. */
export default function NotFound() {
  return (
    <main className="center">
      <div className="g-card login">
        <Logo />
        <h1>Nothing here</h1>
        <p className="muted">This page doesn't exist, or you don't have Manage Server there.</p>
        <a className="g-btn g-btn--secondary" href="/servers">
          Back to your servers
        </a>
      </div>
    </main>
  );
}
