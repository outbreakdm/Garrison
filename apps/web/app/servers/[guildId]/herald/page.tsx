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
import { AutoSaveCard } from "@/components/AutoSave";
import { BackgroundChip } from "@/components/cards/BackgroundChip";
import { ProTag } from "@/components/cards/CardEditor";
import { HeadNote, HeadStatus } from "@/components/ModuleHead";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { getDb } from "@/lib/db";
import { botTopPosition, listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { pageStatus } from "@/lib/module-states";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { undoChange } from "../settings/actions";
import { saveJoinRoles, saveWelcomeCard, saveWelcomeImage } from "./actions";
import { WelcomeCardForm } from "./WelcomeCardForm";

export const metadata: Metadata = { title: "Welcome" };

/** Welcome's tabs: one per message, the join one with its roles and image. */
const WELCOME_TABS = ["join", "leave", "dm"] as const;

export default async function WelcomePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild, session } = await requireGuildAccess(guildId);
  const status = await pageStatus(guild.id, "/herald");
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
  const roleNames = roles.map((r) => [r.id, r.name] as [string, string]);
  const give = roles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const roleLimit = ent["welcome.roles"];
  // A server back on Free keeps the roles it saved; they show, the extra ones pause.
  const roleSlots = Math.max(roleLimit, w.joinRoleIds.length);

  const flash = await readFlash();

  const common = {
    guildId: guild.id,
    ent,
    channels,
    roleNames,
    sample: { name: session.username, server: guild.name },
    planHref: `/servers/${guild.id}/plan`,
    action: saveWelcomeCard,
    undo: undoChange,
  };
  const part = (
    p: "join" | "leave" | "dm",
    saved: { enabled: boolean; channelId: string | null; card: WelcomeConfig["joinCard"] },
  ) => (
    <WelcomeCardForm
      {...common}
      stamp={contentKey(saved)}
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
          <p>Greet people as they join, see them off as they leave, and give first roles.</p>
        </div>
        {status.state === "blocked" ? (
          <HeadNote
            reason={status.reason ?? "Something it needs is missing."}
            href="#join"
            action="Pick a channel"
          />
        ) : (
          <HeadStatus
            on={w.joinEnabled}
            text={
              w.joinEnabled
                ? `Greeting new members${w.leaveEnabled ? ", seeing them off" : ""}${w.dmEnabled ? ", with a DM" : ""}`
                : "No welcome message yet"
            }
            href={w.joinEnabled ? undefined : "#join"}
            action="Turn it on"
          />
        )}
      </div>

      <PageTabs
        label="Welcome"
        tabs={[
          { id: "join", label: "Join", blocked: status.state === "blocked" },
          { id: "leave", label: "Leave" },
          { id: "dm", label: "Welcome DM" },
        ]}
      />
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

      <TabPanel id="join" tabs={WELCOME_TABS}>
        {part("join", { enabled: w.joinEnabled, channelId: w.joinChannelId, card: w.joinCard })}

        <div className="split-2">
          <AutoSaveCard
            id="roles"
            title="Roles on join"
            action={saveJoinRoles}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey(w.joinRoleIds)}
            saveLabel="Save roles on join"
            aside={
              <span className="count">
                {w.joinRoleIds.length} of {roleLimit}
              </span>
            }
          >
            <p className="g-help">
              Given as soon as someone joins, before the welcome card. Roles with moderation or
              admin powers never are.
              {plan === "free"
                ? ` Free servers give ${roleLimit} role; Pro gives up to ${JOIN_ROLES_MAX}.`
                : ""}
            </p>
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
            {verifyRole ? (
              <p className="g-help g-help--warn">
                Verification is on (it gives @{verifyRole.name}). Roles on join are given before
                someone verifies, so pick roles that don't open the channels verification guards.
              </p>
            ) : null}
          </AutoSaveCard>

          <AutoSaveCard
            id="image"
            title="Welcome image"
            action={saveWelcomeImage}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey(w.joinImage)}
            saveLabel="Save welcome image"
            aside={<ProTag on={ent["welcome.image"]} />}
          >
            <p className="g-help">
              Drawn under the welcome card: the new member's avatar, their name and their member
              number.
              {w.joinImage && !ent["welcome.image"] ? " Saved on Pro, paused on Free." : ""}
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
          </AutoSaveCard>
        </div>
      </TabPanel>
      <TabPanel id="leave" tabs={WELCOME_TABS}>
        {part("leave", { enabled: w.leaveEnabled, channelId: w.leaveChannelId, card: w.leaveCard })}
      </TabPanel>
      <TabPanel id="dm" tabs={WELCOME_TABS}>
        {part("dm", { enabled: w.dmEnabled, channelId: null, card: w.dmCard })}
      </TabPanel>
    </>
  );
}
