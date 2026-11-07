import { listActiveGuilds } from "@garrison/db";
import type { ReactNode } from "react";
import { ServerNav } from "@/components/ServerNav";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";
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
  const { session, guild } = await requireGuildAccess(guildId);
  const [guilds, theme] = await Promise.all([
    listActiveGuilds(getDb(), session.manageableGuildIds),
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
        <main className="main">{children}</main>
      </div>
    </>
  );
}
