import { inviteUrl } from "@garrison/brand";
import { listActiveGuilds } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { Art } from "@/components/Art";
import { InviteDialog } from "@/components/InviteDialog";
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
        className="guild-icon guild-icon--lg"
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`}
        alt=""
        width={52}
        height={52}
      />
    );
  const initials = guild.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="guild-icon guild-icon--text guild-icon--lg" aria-hidden="true">
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
      <main className="picker">
        <div className="picker__head">
          <h1>Pick a server</h1>
          <p>
            Servers where you have Manage Server. Open one to run it from here, or add Garrison to
            one it isn't guarding yet.
          </p>
        </div>

        <section className="block" aria-labelledby="with-garrison">
          <h2 className="block-title" id="with-garrison">
            With Garrison <span className="count">{installed.length}</span>
          </h2>
          {installed.length ? (
            <ul className="server-grid">
              {installed.map((g) => (
                <li key={g.id}>
                  <Link href={`/servers/${g.id}`} className="server-tile" transitionTypes={["nav"]}>
                    <span className="server-tile__top">
                      <GuildIcon guild={g} />
                      <span className="server-tile__id">
                        {/* The name flies into the server's Overview title. */}
                        <ViewTransition
                          name={`guild-${g.id}`}
                          share={{ nav: "morph", default: "none" }}
                          default="none"
                        >
                          <span className="server-tile__name">{g.name}</span>
                        </ViewTransition>
                        <span className="server-tile__state">Garrison is in</span>
                      </span>
                    </span>
                    <span className="server-tile__foot">
                      Open dashboard
                      <span className="cue" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="g-card picker__empty">
              <Art slot="empty" className="empty-art" decorative />
              <div>
                <h3 className="card-title">Garrison isn't in any of your servers yet</h3>
                <p>Add it to one below. It asks only for the permissions it uses.</p>
              </div>
            </div>
          )}
        </section>

        {available.length ? (
          <section className="block" aria-labelledby="add-garrison">
            <h2 className="block-title" id="add-garrison">
              Add Garrison <span className="count">{available.length}</span>
            </h2>
            <ul className="server-grid">
              {available.map((g) => (
                <li key={g.id}>
                  <div className="server-tile server-tile--add">
                    <span className="server-tile__top">
                      <GuildIcon guild={g} />
                      <span className="server-tile__id">
                        <span className="server-tile__name">{g.name}</span>
                        <span className="server-tile__state">Not added yet</span>
                      </span>
                    </span>
                    <span className="server-tile__foot">
                      <InviteDialog guildName={g.name} href={inviteUrl(clientId, g.id)} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="picker__foot">
          Missing a server? Lists come from Discord when you sign in.{" "}
          <a href="/auth/login?next=/servers">Sign in again</a> to refresh it.
        </p>
      </main>
    </>
  );
}
