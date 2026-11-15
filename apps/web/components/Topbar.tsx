import { Logo } from "./Logo";
import { MemberAvatar } from "./MemberAvatar";
import { SearchBox } from "./SearchBox";
import { ServerSwitcher } from "./ServerSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export interface TopbarProps {
  username: string;
  theme: "dark" | "light";
  back: string;
  /** The current server, and others to switch to. */
  guild?: { id: string; name: string };
  guilds?: { id: string; name: string }[];
  /** Beside the server rail, which carries the logo and switcher on wider screens. */
  railed?: boolean;
}

export function Topbar({ username, theme, back, guild, guilds = [], railed }: TopbarProps) {
  return (
    <header className={`topbar${railed ? " topbar--railed" : ""}`}>
      {/* First stop for keyboards: past the bar and the menu, straight to the page. */}
      <a className="skip-link" href="#content">
        Skip to the page
      </a>
      <a className="topbar__logo" href="/servers" aria-label="All servers">
        <Logo />
      </a>
      {guild ? <ServerSwitcher guild={guild} guilds={guilds} /> : null}
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
