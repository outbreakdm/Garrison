import { Logo } from "./Logo";
import { MemberAvatar } from "./MemberAvatar";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";

export interface TopbarProps {
  username: string;
  theme: "dark" | "light";
  back: string;
  /** The current server, and others to switch to. */
  guild?: { id: string; name: string };
  guilds?: { id: string; name: string }[];
}

export function Topbar({ username, theme, back, guild, guilds = [] }: TopbarProps) {
  return (
    <header className="topbar">
      {/* First stop for keyboards: past the bar and the menu, straight to the page. */}
      <a className="skip-link" href="#content">
        Skip to the page
      </a>
      <a href="/servers" aria-label="All servers">
        <Logo />
      </a>
      {guild ? (
        // A details menu: switching servers needs no JavaScript.
        <details className="switcher">
          <summary className="g-btn g-btn--secondary">
            <span className="switcher__name">{guild.name}</span>
          </summary>
          <div className="switcher__menu" role="menu">
            {guilds.map((g) => (
              <a
                key={g.id}
                role="menuitem"
                href={`/servers/${g.id}`}
                aria-current={g.id === guild.id ? "true" : undefined}
              >
                {g.name}
              </a>
            ))}
            <a role="menuitem" href="/servers">
              All servers
            </a>
          </div>
        </details>
      ) : null}
      <span className="topbar__spacer" />
      {guild ? <SearchBox guildId={guild.id} /> : null}
      <ThemeToggle back={back} theme={theme} />
      <a className="topbar__user" href="/account" title="Your game accounts">
        <MemberAvatar name={username} src={null} />
        <span className="topbar__name">{username}</span>
      </a>
      {/* POST + Origin check + SameSite cookie: logout can't be triggered cross-site. */}
      <form className="topbar__signout" method="post" action="/auth/logout">
        <button type="submit" className="g-btn g-btn--ghost">
          Sign out
        </button>
      </form>
    </header>
  );
}
