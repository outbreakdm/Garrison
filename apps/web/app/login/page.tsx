import type { Metadata } from "next";
import { Art } from "@/components/Art";
import { Logo } from "@/components/Logo";
import { safeNext } from "@/lib/security";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  denied: "Discord sign-in was canceled.",
  state: "That sign-in link expired or was tampered with. Try again.",
  discord: "Discord didn't answer. Try again in a moment.",
  mismatch:
    "You approved with a different Discord account than the one signed in here. Sign in with that account first.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = params.error ? ERRORS[params.error] : undefined;
  return (
    <main className="center">
      <div className="g-card login">
        <Art slot="login" className="card-banner" decorative eager />
        <Logo />
        <h1>Sign in to your servers</h1>
        <p className="muted">
          Garrison asks Discord for your name and server list, then forgets the Discord token.
          You'll see servers where you have Manage Server.
        </p>
        {error ? <div className="notice">{error}</div> : null}
        <a className="g-btn g-btn--primary" href={`/auth/login?next=${encodeURIComponent(next)}`}>
          Sign in with Discord
        </a>
      </div>
    </main>
  );
}
