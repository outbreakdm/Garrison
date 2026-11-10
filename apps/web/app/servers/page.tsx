import { inviteUrl } from "@garrison/brand";
import { listActiveGuilds } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { InviteDialog } from "@/components/InviteDialog";
import { PageHead } from "@/components/PageHead";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Servers" };

type ListedGuild = { id: string; name: string; icon: string | null };

function GuildIcon({ guild }: { guild: ListedGuild }) {
  if (guild.icon)
    return (
      // Discord's CDN is allowed by the CSP (img-src); the icon hash was checked at sign-in.
      // biome-ignore lint/performance/noImgElement: tiny remote icon, no optimisation needed
      <img
        className="guild-icon"
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
        alt=""
        width={40}
        height={40}
      />
    );
  const initials = guild.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="guild-icon guild-icon--text" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export default async function ServersPage() {
  const session = await requireSession("/servers");
  const db = await getDb();
  // Checked live: a server you added Garrison to after signing in shows up here.
  const withGarrison = await listActiveGuilds(db, session.manageableGuildIds);
  const active = new Set(withGarrison.map((g) => g.id));
  const known: ListedGuild[] = session.manageableGuilds.length
    ? session.manageableGuilds
    : withGarrison.map((g) => ({ id: g.id, name: g.name, icon: null }));
  const installed = known.filter((g) => active.has(g.id));
  const available = known.filter((g) => !active.has(g.id));
  const clientId = env().DISCORD_CLIENT_ID;

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/servers" />
      <main className="shell">
        <div className="main">
          <PageHead
            title="Your servers"
            description="Servers where you have Manage Server in Discord. Open one to run Garrison there."
          />

          <section className="card-col" aria-labelledby="with-garrison">
            <div className="section-head">
              <h2 id="with-garrison">With Garrison</h2>
              <p>{installed.length ? `${installed.length} to manage` : ""}</p>
            </div>
            {installed.length ? (
              <div className="servers">
                {installed.map((g) => (
                  <Link key={g.id} href={`/servers/${g.id}`} className="server-row g-card">
                    <GuildIcon guild={g} />
                    <span className="big">{g.name}</span>
                    <span className="g-btn g-btn--secondary">Open</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="g-card muted">
                Garrison isn't in any of your servers yet. Add it to one below.
              </div>
            )}
          </section>

          {available.length ? (
            <section className="card-col" aria-labelledby="add-garrison">
              <div className="section-head">
                <h2 id="add-garrison">Add Garrison to another server</h2>
                <p>{available.length} without it</p>
              </div>
              <div className="servers">
                {available.map((g) => (
                  <div key={g.id} className="server-row g-card">
                    <GuildIcon guild={g} />
                    <span className="big">{g.name}</span>
                    <InviteDialog guildName={g.name} href={inviteUrl(clientId, g.id)} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="g-help">
            Missing a server? Lists come from Discord when you sign in.{" "}
            <a href="/auth/login?next=/servers">Sign in again</a> to refresh it.
          </p>
        </div>
      </main>
    </>
  );
}
