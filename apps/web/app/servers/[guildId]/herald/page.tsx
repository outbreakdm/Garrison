import {
  entitlements,
  getGuildPlan,
  getOverview,
  getWelcome,
  isPresetBackground,
  JOIN_ROLES_MAX,
  RANK_BACKGROUNDS,
  type WelcomeConfig,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackgroundChip } from "@/components/cards/BackgroundChip";
import { ProTag } from "@/components/cards/CardEditor";
import { FormFoot } from "@/components/settings";
import { getDb } from "@/lib/db";
import { botTopPosition, listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { saveJoinRoles, saveWelcomeCard, saveWelcomeImage } from "./actions";
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
  const [w, plan, channels, roles, botTop, overview] = await Promise.all([
    getWelcome(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    botTopPosition(guild.id),
    getOverview(db, guild.id),
  ]);
  const verifyId = overview.gatehouse?.verifyRoleId;
  const verifyRole = verifyId ? roles.find((r) => r.id === verifyId) : null;
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

  const flash = await readFlash();

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
    <WelcomeCardForm
      key={contentKey(saved)}
      {...common}
      part={p}
      saved={saved}
      locked={p === "dm" && !ent["welcome.dm"]}
    />
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
        id="image"
        title="Welcome image"
        facts={[
          w.joinImage
            ? isPresetBackground(w.joinImage)
              ? (RANK_BACKGROUNDS[w.joinImage]?.label ?? "On")
              : "Your image"
            : "Off",
          ...(w.joinImage && !ent["welcome.image"] ? ["Paused on Free"] : []),
        ]}
        open={editing === "image"}
      >
        <form action={saveWelcomeImage} className="settings-form" key={contentKey(w.joinImage)}>
          <input type="hidden" name="guildId" value={guild.id} />
          <p className="g-help">
            Drawn under the welcome card: the new member's avatar, their name and their member
            number. <ProTag on={ent["welcome.image"]} />
          </p>
          <div className="swatches" role="radiogroup" aria-label="Background">
            <label className="swatch">
              <input type="radio" name="background" value="" defaultChecked={!w.joinImage} />
              <span className="swatch__chip swatch__chip--off" aria-hidden="true" />
              <span className="swatch__name">Off</span>
            </label>
            {Object.entries(RANK_BACKGROUNDS).map(([key, bg]) => (
              <label className="swatch" key={key}>
                <input
                  type="radio"
                  name="background"
                  value={key}
                  defaultChecked={w.joinImage === key}
                  disabled={!ent["welcome.image"] && w.joinImage !== key}
                />
                <BackgroundChip from={bg.from} to={bg.to} />
                <span className="swatch__name">{bg.label}</span>
              </label>
            ))}
            <label className="swatch swatch--image">
              <input
                type="radio"
                name="background"
                value="image"
                defaultChecked={Boolean(w.joinImage && !isPresetBackground(w.joinImage))}
                disabled={!ent["welcome.image"] && !w.joinImage}
              />
              <span className="swatch__chip" aria-hidden="true" />
              <span className="swatch__name">Your image</span>
            </label>
          </div>
          <label className="g-field" htmlFor="imageUrl">
            <span>Image link (for "Your image")</span>
            <input
              className="g-input"
              id="imageUrl"
              name="imageUrl"
              type="url"
              inputMode="url"
              placeholder="https://cdn.discordapp.com/attachments/…"
              defaultValue={w.joinImage && !isPresetBackground(w.joinImage) ? w.joinImage : ""}
            />
            <span className="g-help">
              Upload it to any Discord channel and copy its link. 1000 × 360 fits best.
            </span>
          </label>
          <FormFoot label="Save welcome image" guildId={guild.id} />
        </form>
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
        <form action={saveJoinRoles} className="settings-form" key={contentKey(w.joinRoleIds)}>
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
          {verifyRole ? (
            <p className="g-help g-help--warn">
              Verification is on (it gives @{verifyRole.name}). Roles on join are given before
              someone verifies, so pick roles that don't open the channels verification guards.
            </p>
          ) : null}
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
