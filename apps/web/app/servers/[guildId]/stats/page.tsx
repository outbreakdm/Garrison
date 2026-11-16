import {
  entitlements,
  getGuildPlan,
  getServerStats,
  listStatChannels,
  type StatKind,
} from "@garrison/db";
import type { Metadata } from "next";
import { HeadNote, HeadSwitch } from "@/components/ModuleHead";
import { SettingsNotice } from "@/components/settings";
import { getDb } from "@/lib/db";
import { botPermissions, getServerLayout, guildCounts } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { pageStatus } from "@/lib/module-states";
import { requireGuildAccess } from "@/lib/session";
import { undoChange } from "../settings/actions";
import { saveServerStats } from "./actions";
import { StatsEditor } from "./StatsEditor";

export const metadata: Metadata = { title: "Server stats" };

/** Manage Channels (or Administrator): needed to make and rename the counter channels. */
const MANAGE_CHANNELS = 1n << 4n;
const ADMINISTRATOR = 1n << 3n;

export default async function ServerStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const status = await pageStatus(guild.id, "/stats");
  const query = await searchParams;
  const db = await getDb();
  const [config, plan, records, layout, counts, perms, flash] = await Promise.all([
    getServerStats(db, guild.id),
    getGuildPlan(db, guild.id),
    listStatChannels(db, guild.id),
    getServerLayout(guild.id).catch(() => null),
    guildCounts(guild.id).catch(() => null),
    botPermissions(guild.id),
    readFlash(),
  ]);
  const channels = layout ? [...layout.loose, ...layout.categories.flatMap((c) => c.channels)] : [];
  const voice = channels.filter((c) => c.kind === "voice").map((c) => ({ id: c.id, name: c.name }));
  // What the dashboard can count itself; people, bots and a role's members come from the bot.
  const known: Partial<Record<StatKind, number>> = {};
  if (counts?.members != null) known.members = counts.members;
  if (counts?.boosts != null) known.boosts = counts.boosts;
  if (layout) {
    known.channels = channels.length;
    known.roles = layout.roles.length;
  }
  const shown = Object.fromEntries(
    records.filter((r) => r.count !== null).map((r) => [r.counterKey, r.count as number]),
  );
  const canManage = perms === null || (perms & (MANAGE_CHANNELS | ADMINISTRATOR)) !== 0n;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Server stats</h1>
          <p>
            Voice channels named with a live count, like “Members: 372”, at the top of your channel
            list. Members see them but can't join; Garrison keeps the numbers current.
          </p>
        </div>
        <HeadSwitch
          key={contentKey(config)}
          label="Server stats"
          name="enabled"
          form="settings-form"
          defaultChecked={config.enabled}
        />
        {status.state === "blocked" ? (
          <HeadNote
            reason={status.reason ?? "Something it needs is missing."}
            href={status.reason?.includes("Manage Channels") ? undefined : "#settings"}
            action="Add one"
          />
        ) : null}
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}
      <SettingsNotice query={query} />
      {!canManage ? (
        <div className="notice" role="alert">
          Garrison can't make channels yet: give its role the Manage Channels permission (Server
          Settings, Roles), or add Garrison again from the server list to accept it.
        </div>
      ) : null}

      <StatsEditor
        guildId={guild.id}
        counters={config.counters}
        categoryId={config.categoryId}
        limit={entitlements(plan)["stats.counters"]}
        roles={(layout?.roles ?? [])
          .filter((r) => !r.managed)
          .map((r) => ({ id: r.id, name: r.name }))}
        voice={voice}
        categories={(layout?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        known={known}
        shown={shown}
        action={saveServerStats}
        undo={undoChange}
        stamp={contentKey(config)}
      />
    </>
  );
}
