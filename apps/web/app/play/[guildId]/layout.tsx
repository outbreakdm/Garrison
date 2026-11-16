import Link from "next/link";
import type { ReactNode } from "react";
import { MemberTabs } from "@/components/MemberTabs";
import { Topbar } from "@/components/Topbar";
import { memberSpace } from "@/lib/member";
import { currentTheme } from "@/lib/theme";

/**
 * A member's space in a server: You (their level and rank card), Groups and raids, and Your
 * record when the server shows it. Members only; each page checks again.
 */
export default async function MemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { session, guild, show, manager } = await memberSpace(guildId);
  const base = `/play/${guild.id}`;
  const tabs = [
    ...(show.you ? [{ href: `${base}/you`, label: "You" }] : []),
    ...(show.wallet ? [{ href: `${base}/wallet`, label: "Wallet" }] : []),
    { href: base, label: "Groups and raids" },
    ...(show.record ? [{ href: `${base}/record`, label: "Your record" }] : []),
  ];
  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back={base} />
      <main id="content" className="member">
        <header className="member__head">
          <span className="member__mark" aria-hidden="true">
            {(guild.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "G").toUpperCase()}
          </span>
          <span className="member__title">
            <span className="member__server">{guild.name}</span>
            <span className="member__sub">Your space in this server</span>
          </span>
          {manager ? (
            <Link className="g-btn g-btn--secondary g-btn--sm" href={`/servers/${guild.id}`}>
              Run this server
            </Link>
          ) : null}
        </header>
        <MemberTabs tabs={tabs} />
        {children}
      </main>
    </>
  );
}
