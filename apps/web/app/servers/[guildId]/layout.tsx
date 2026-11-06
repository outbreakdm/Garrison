import type { ReactNode } from "react";
import { ServerNav } from "@/components/ServerNav";
import { Topbar } from "@/components/Topbar";
import { requireGuildAccess } from "@/lib/session";

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
  return (
    <>
      <Topbar username={session.username} guildName={guild.name} />
      <div className="shell">
        <ServerNav guildId={guild.id} />
        <main className="main">{children}</main>
      </div>
    </>
  );
}
