import { listActiveGuilds } from "@garrison/db";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/PageTransition";
import { ServerNav } from "@/components/ServerNav";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireGuildAccess, requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";

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
  const [{ session, guild }, guilds, theme] = await Promise.all([
    requireGuildAccess(guildId),
    requireSession(`/servers/${guildId}`).then(async (s) =>
      listActiveGuilds(await getDb(), s.manageableGuildIds),
    ),
    currentTheme(),
  ]);
  return (
    <>
      <Topbar
        username={session.username}
        theme={theme}
        back={`/servers/${guild.id}`}
        guild={guild}
        guilds={guilds}
      />
      <div className="shell">
        <ServerNav guildId={guild.id} />
        <main className="main">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </>
  );
}
