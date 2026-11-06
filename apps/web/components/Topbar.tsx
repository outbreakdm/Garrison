import { Logo } from "./Logo";

export function Topbar({ username, guildName }: { username: string; guildName?: string }) {
  return (
    <header className="topbar">
      <a href="/servers" aria-label="All servers">
        <Logo />
      </a>
      {guildName ? <span className="g-badge">{guildName}</span> : null}
      <span className="topbar__spacer" />
      <a className="topbar__user" href="/account">
        {username}
      </a>
      {/* POST + Origin check + SameSite cookie: logout can't be triggered cross-site. */}
      <form method="post" action="/auth/logout">
        <button type="submit" className="g-btn g-btn--ghost">
          Sign out
        </button>
      </form>
    </header>
  );
}
