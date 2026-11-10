import { toggleTheme } from "@/app/theme-actions";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";

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
      <a href="/servers" aria-label="All servers">
        <Logo />
      </a>
      {guild ? (
        // A details menu: switching servers needs no JavaScript.
        <details className="switcher">
          <summary className="g-btn g-btn--secondary">
            <span className="switcher__name">{guild.name}</span>
          </summary>
          <div className="switcher__menu">
            <span className="switcher__label g-label">Your servers</span>
            {guilds.map((g) => (
              <a
                key={g.id}
                href={`/servers/${g.id}`}
                aria-current={g.id === guild.id ? "true" : undefined}
              >
                {g.name}
              </a>
            ))}
            <a className="switcher__more" href="/servers">
              All servers, or add Garrison to one
            </a>
          </div>
        </details>
      ) : null}
      <span className="topbar__spacer" />
      {guild ? <SearchBox guildId={guild.id} /> : null}
      {/* Everything about you in one menu, so the bar stays one row on a phone. */}
      <details className="switcher switcher--end">
        <summary className="g-btn g-btn--ghost">
          <span className="switcher__name">{username}</span>
        </summary>
        <div className="switcher__menu">
          <a href="/account">Your account and game accounts</a>
          <form action={toggleTheme}>
            <input type="hidden" name="back" value={back} />
            <button type="submit">{theme === "dark" ? "Use light theme" : "Use dark theme"}</button>
          </form>
          {/* POST + Origin check + SameSite cookie: logout can't be triggered cross-site. */}
          <form method="post" action="/auth/logout">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </details>
    </header>
  );
}
