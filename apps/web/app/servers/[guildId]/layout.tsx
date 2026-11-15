import { aiTier, listActiveGuilds } from "@garrison/db";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { PageTransition } from "@/components/PageTransition";
import { PlanFoot } from "@/components/PlanFoot";
import { ServerNav } from "@/components/ServerNav";
import { ServerSwitcher } from "@/components/ServerSwitcher";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireGuildAccess, requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";

/**
 * A server's console: a full-height rail (the logo, this server and a switch to others,
 * the menu, the plan) beside a slim top bar and the page. On phones the rail gives way to
 * the top bar's switcher and a pinned menu button (ServerNav's sheet).
 */
export default async function ServerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // Pages check access too: layouts don't re-run on every navigation.
  // The switcher's server list needs only the session, so it loads beside the access check.
  const [{ session, guild }, guilds, theme, tier] = await Promise.all([
    requireGuildAccess(guildId),
    requireSession(`/servers/${guildId}`).then(async (s) =>
      listActiveGuilds(await getDb(), s.manageableGuildIds),
    ),
    currentTheme(),
    getDb().then((db) => aiTier(db, guildId)),
  ]);
  return (
    <div className="shell console">
      <aside className="console__side" aria-label="Server">
        <a className="console__brand" href="/servers" aria-label="All servers">
          <Logo />
        </a>
        <ServerSwitcher guild={guild} guilds={guilds} variant="card" />
        <ServerNav guildId={guild.id} variant="rail" />
        <PlanFoot guildId={guild.id} tier={tier} />
      </aside>
      <div className="console__body">
        <Topbar
          username={session.username}
          theme={theme}
          back={`/servers/${guild.id}`}
          guild={guild}
          guilds={guilds}
          railed
        />
        <ServerNav guildId={guild.id} variant="sheet" />
        <main id="content" className="main">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
