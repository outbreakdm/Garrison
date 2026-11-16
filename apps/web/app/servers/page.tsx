import { inviteUrl } from "@garrison/brand";
import { isStaff, listActiveGuilds } from "@garrison/db";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ViewTransition } from "react";
import { EmptyState } from "@/components/EmptyState";
import { InviteDialog } from "@/components/InviteDialog";
import { Topbar } from "@/components/Topbar";
import { unpackPrompt } from "@/lib/build-prompt";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { BUILD_COOKIE, requireSession } from "@/lib/session";
import { listSharedGuilds } from "@/lib/shared-servers";
import { currentTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Servers" };

type ListedGuild = { id: string; name: string; icon: string | null };

function GuildIcon({ guild }: { guild: ListedGuild }) {
  if (guild.icon)
    return (
      // Discord's CDN is allowed by the CSP (img-src); the icon hash was checked at sign-in.
      // biome-ignore lint/performance/noImgElement: tiny remote icon, no optimization needed
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

/** A server tile that takes the landing page's "Build me a…" to that server's AI assistant. */
function BuildTile({ guild, state }: { guild: ListedGuild; state: string }) {
  return (
    // A route that redirects, not a page: a plain link.
    <a href={`/build?to=${guild.id}`} className="server-tile server-tile--build">
      <span className="server-tile__top">
        <GuildIcon guild={guild} />
        <span className="server-tile__id">
          <span className="server-tile__name">{guild.name}</span>
          <span className="server-tile__state">{state}</span>
        </span>
      </span>
      <span className="server-tile__foot">
        Build it here
        <span className="cue" aria-hidden="true" />
      </span>
    </a>
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
  const [staff, shared, jar, joined] = await Promise.all([
    isStaff(db, session.userId),
    listSharedGuilds(session),
    cookies(),
    // Every server with Garrison they're in (Discord's list at sign-in): their own space there.
    listActiveGuilds(db, session.memberGuildIds),
  ]);
  const elsewhere = new Set([...known.map((g) => g.id), ...shared.map((g) => g.id)]);
  const memberOf = joined.filter((g) => !elsewhere.has(g.id));
  // "Build me a…" from the landing page: a server you can change hands it to its AI assistant.
  const idea = unpackPrompt(jar.get(BUILD_COOKIE)?.value);
  const canBuild = installed.length > 0 || shared.some((g) => g.level === "editor");

  return (
    <>
      <Topbar username={session.username} theme={await currentTheme()} back="/servers" />
      <main id="content" className="picker">
        <div className="picker__head">
          <h1>Pick a server</h1>
          <p>
            Servers you run, ones someone shared with you, and ones you're in: your level, rank
            card, groups and raids there. Or add Garrison to one it isn't guarding yet.
          </p>
          {staff ? (
            <p>
              <a href="/staff">Staff: every server's plan</a>
            </p>
          ) : null}
        </div>

        {idea ? (
          <div className="build-note" role="status">
            <span className="build-note__mark" aria-hidden="true" />
            <p className="build-note__text">
              <strong>
                {canBuild
                  ? "Pick a server to build it in"
                  : "Add Garrison to a server, then build it there"}
              </strong>
              <span className="build-note__idea">“{idea}”</span>
            </p>
            <a className="g-btn g-btn--ghost g-btn--sm" href="/build?clear=1">
              Never mind
            </a>
          </div>
        ) : null}

        {/* Someone who runs no server but is in some skips straight to those. */}
        {installed.length || !memberOf.length ? (
          <section className="block" aria-labelledby="with-garrison">
            <h2 className="block-title" id="with-garrison">
              With Garrison <span className="count">{installed.length}</span>
            </h2>
            {installed.length ? (
              <ul className="server-grid">
                {installed.map((g) => (
                  <li key={g.id}>
                    {idea ? (
                      <BuildTile guild={g} state="Garrison is in" />
                    ) : (
                      <Link
                        href={`/servers/${g.id}`}
                        className="server-tile"
                        transitionTypes={["nav"]}
                      >
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
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                mark="server"
                title="Garrison isn't in any of your servers yet"
                headingLevel={3}
              >
                Pick one under Add Garrison below. It asks only for the permissions it uses, never
                Administrator.
              </EmptyState>
            )}
          </section>
        ) : null}

        {shared.length ? (
          <section className="block" aria-labelledby="shared-with-you">
            <h2 className="block-title" id="shared-with-you">
              Shared with you <span className="count">{shared.length}</span>
            </h2>
            <ul className="server-grid">
              {shared.map((g) => (
                <li key={g.id}>
                  {idea && g.level === "editor" ? (
                    <BuildTile
                      guild={{ id: g.id, name: g.name, icon: null }}
                      state="You can change settings"
                    />
                  ) : (
                    <Link
                      href={`/servers/${g.id}`}
                      className="server-tile"
                      transitionTypes={["nav"]}
                    >
                      <span className="server-tile__top">
                        <GuildIcon guild={{ id: g.id, name: g.name, icon: null }} />
                        <span className="server-tile__id">
                          <span className="server-tile__name">{g.name}</span>
                          <span className="server-tile__state">
                            {g.level === "editor" ? "You can change settings" : "You can view"}
                          </span>
                        </span>
                      </span>
                      <span className="server-tile__foot">
                        Open dashboard
                        <span className="cue" aria-hidden="true" />
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {memberOf.length ? (
          <section className="block" aria-labelledby="member-of">
            <h2 className="block-title" id="member-of">
              Servers you're in <span className="count">{memberOf.length}</span>
            </h2>
            <ul className="server-grid">
              {memberOf.map((g) => (
                <li key={g.id}>
                  <Link href={`/play/${g.id}/you`} className="server-tile">
                    <span className="server-tile__top">
                      <GuildIcon guild={{ id: g.id, name: g.name, icon: null }} />
                      <span className="server-tile__id">
                        <span className="server-tile__name">{g.name}</span>
                        <span className="server-tile__state">You're a member</span>
                      </span>
                    </span>
                    <span className="server-tile__foot">
                      Your space
                      <span className="cue" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
