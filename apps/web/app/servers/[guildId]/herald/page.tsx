import {
  entitlements,
  getGuildPlan,
  getWelcome,
  JOIN_ROLES_MAX,
  type WelcomeConfig,
} from "@garrison/db";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/lib/db";
import { botTopPosition, listGuildRoles, listTextChannels } from "@/lib/discord";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { saveJoinRoles, saveWelcomeCard } from "./actions";
import { WelcomeCardForm } from "./WelcomeCardForm";

export const metadata: Metadata = { title: "Welcome" };

function Panel({
  id,
  title,
  facts,
  open,
  children,
}: {
  id: string;
  title: string;
  facts: string[];
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details className="g-card panel" id={id} open={open}>
      <summary className="panel__summary">
        <span className="panel__title panel__title--lg">{title}</span>
        <span className="panel__facts">
          {facts.map((f) => (
            <span className="fact" key={f}>
              {f}
            </span>
          ))}
        </span>
        <span className="panel__cue" aria-hidden="true" />
      </summary>
      <div className="panel__body">{children}</div>
    </details>
  );
}

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild, session } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [w, plan, channels, roles, botTop] = await Promise.all([
    getWelcome(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    botTopPosition(guild.id),
  ]);
  const ent = entitlements(plan);
  const editing = typeof query.edit === "string" ? query.edit : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const roleNames = roles.map((r) => [r.id, r.name] as [string, string]);
  const give = roles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const roleLimit = ent["welcome.roles"];
  // A server back on Free keeps the roles it saved; they show, the extra ones pause.
  const roleSlots = Math.max(roleLimit, w.joinRoleIds.length);
  const where = (on: boolean, id: string | null) =>
    on ? (id ? `On · #${channelName.get(id) ?? "deleted-channel"}` : "On · no channel") : "Off";

  let flash: { ok?: string; error?: string } | null = null;
  try {
    const c = (await cookies()).get("garrison_flash")?.value;
    flash = c ? JSON.parse(c) : null;
  } catch {
    flash = null;
  }

  const common = {
    guildId: guild.id,
    ent,
    channels,
    roleNames,
    sample: { name: session.username, server: guild.name },
    planHref: `/servers/${guild.id}/plan`,
    action: saveWelcomeCard,
  };
  const part = (
    p: "join" | "leave" | "dm",
    saved: { enabled: boolean; channelId: string | null; card: WelcomeConfig["joinCard"] },
  ) => (
    <WelcomeCardForm {...common} part={p} saved={saved} locked={p === "dm" && !ent["welcome.dm"]} />
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome</h1>
          <p>
            Greet people as they join, see them off when they leave, and give new members their
            first roles. Herald stays quiet during a raid or lockdown, so raiders get nothing.
          </p>
        </div>
        <span className="mono">{plan === "pro" ? "Pro" : "Free"}</span>
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}

      <Panel
        id="join"
        title="Welcome card"
        facts={[where(w.joinEnabled, w.joinChannelId), `“${w.joinCard.title}”`]}
        open={editing === "join"}
      >
        {part("join", { enabled: w.joinEnabled, channelId: w.joinChannelId, card: w.joinCard })}
      </Panel>

      <Panel
        id="roles"
        title="Roles on join"
        facts={[
          w.joinRoleIds.length
            ? w.joinRoleIds
                .map((id) => `@${roles.find((r) => r.id === id)?.name ?? "deleted-role"}`)
                .join(", ")
            : "None",
        ]}
        open={editing === "roles"}
      >
        <form action={saveJoinRoles} className="settings-form">
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="settings-grid">
            {Array.from({ length: roleSlots }, (_, i) => {
              const current = w.joinRoleIds[i] ?? "";
              const role = roles.find((r) => r.id === current);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
                <label className="g-field" key={i}>
                  <span>
                    {roleSlots === 1 ? "Role" : `Role ${i + 1}`}
                    {i >= roleLimit ? " (paused: Pro)" : ""}
                  </span>
                  <select className="g-input" name="joinRoleIds" defaultValue={current}>
                    <option value="">None</option>
                    {give.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                        {botTop !== null && r.position >= botTop ? " (above Garrison)" : ""}
                      </option>
                    ))}
                  </select>
                  {role && botTop !== null && role.position >= botTop ? (
                    <span className="g-help g-help--warn">
                      Garrison's role sits below @{role.name}. Drag Garrison above it in Server
                      Settings → Roles.
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <p className="g-help">
            Given as soon as someone joins, before the welcome card. Roles with moderation or admin
            powers never are.
            {plan === "free"
              ? ` Free servers give ${roleLimit} role; Pro gives up to ${JOIN_ROLES_MAX}.`
              : ""}
          </p>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary">
              Save roles on join
            </button>
            <span className="g-help">
              Recorded in{" "}
              <Link href={`/servers/${guild.id}/settings#history`}>Settings history</Link>, where it
              can be undone.
            </span>
          </div>
        </form>
      </Panel>

      <Panel
        id="leave"
        title="Leave card"
        facts={[where(w.leaveEnabled, w.leaveChannelId), `“${w.leaveCard.title}”`]}
        open={editing === "leave"}
      >
        {part("leave", { enabled: w.leaveEnabled, channelId: w.leaveChannelId, card: w.leaveCard })}
      </Panel>

      <Panel
        id="dm"
        title="Welcome DM"
        facts={[
          w.dmEnabled ? (ent["welcome.dm"] ? "On" : "Paused: Pro") : "Off",
          ent["welcome.dm"] ? `“${w.dmCard.title}”` : "Pro",
        ]}
        open={editing === "dm"}
      >
        {part("dm", { enabled: w.dmEnabled, channelId: null, card: w.dmCard })}
      </Panel>
    </>
  );
}
