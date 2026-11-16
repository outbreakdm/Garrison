import { aiTier, formatPrice, listActiveGuilds, PRICING } from "@garrison/db";
import type { ReactNode } from "react";
import { AccessGuard } from "@/components/AccessGuard";
import { Logo } from "@/components/Logo";
import { PageTransition } from "@/components/PageTransition";
import { PlanFoot } from "@/components/PlanFoot";
import { ProSheet } from "@/components/ProSheet";
import { ServerNav } from "@/components/ServerNav";
import { ServerSwitcher } from "@/components/ServerSwitcher";
import { Toaster } from "@/components/Toaster";
import { Topbar } from "@/components/Topbar";
import { billingReady } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { moduleStates, pageStates } from "@/lib/module-states";
import { requireGuildAccess, requireSession } from "@/lib/session";
import { listSharedGuilds } from "@/lib/shared-servers";
import { currentTheme } from "@/lib/theme";
import { checkoutAction } from "./plan/actions";

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
  const [{ session, guild, role }, guilds, theme, tier, mods] = await Promise.all([
    requireGuildAccess(guildId),
    // The switcher lists your servers and ones shared with you (each confirmed live).
    requireSession(`/servers/${guildId}`).then(async (s) => {
      const [own, shared] = await Promise.all([
        listActiveGuilds(await getDb(), s.manageableGuildIds),
        listSharedGuilds(s),
      ]);
      return [...own, ...shared.map(({ id, name }) => ({ id, name }))];
    }),
    currentTheme(),
    getDb().then((db) => aiTier(db, guildId)),
    // Which modules are running, for the menu's dots. Refreshed after every save.
    moduleStates(guildId).catch(() => []),
  ]);
  // Blocked if anything on a page can't work, else on if anything is (Moderation: automod
  // or its log channel), else off.
  const states = pageStates(mods);
  return (
    <div className="shell console">
      <aside className="console__side" aria-label="Server">
        <a className="console__brand" href="/servers" aria-label="All servers">
          <Logo />
        </a>
        <ServerSwitcher guild={guild} guilds={guilds} variant="card" />
        <ServerNav guildId={guild.id} variant="rail" states={states} />
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
        <ServerNav guildId={guild.id} variant="sheet" states={states} />
        <main id="content" className="main">
          {role === "manager" ? null : <AccessNote role={role} />}
          <PageTransition>{children}</PageTransition>
        </main>
        <AccessGuard role={role} />
      </div>
      <Toaster />
      {tier === "free" ? (
        <ProSheet
          guildId={guild.id}
          price={formatPrice(PRICING.pro.monthly)}
          highlights={PRICING.pro.highlights}
          // Only a manager can buy Pro; anyone else sees what it adds and where to ask.
          checkout={billingReady() && role === "manager" ? checkoutAction : null}
        />
      ) : null}
    </div>
  );
}

/** For someone with shared access: what they can do here, in a line. */
function AccessNote({ role }: { role: "viewer" | "editor" }) {
  return (
    <p className="access-note" role="note">
      <span className="g-badge">{role === "viewer" ? "Viewer" : "Editor"}</span>
      {role === "viewer"
        ? "You can see everything on this server's dashboard. Changes are up to its managers and editors."
        : "You can change settings and post. Moderation, backups, the plan and who has access stay with people who have Manage Server."}
    </p>
  );
}
