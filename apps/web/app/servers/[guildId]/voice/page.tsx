import {
  entitlements,
  getGuildPlan,
  getVoiceRooms,
  listVoiceRooms,
  STANDARD_ROOM_NAME,
  VOICE_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoSaveCard } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { HeadSwitch } from "@/components/ModuleHead";
import { CheckList, SettingsNotice } from "@/components/settings";
import { getDb } from "@/lib/db";
import { botPermissions, getServerLayout, memberNames } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { undoChange } from "../settings/actions";
import { saveVoiceRooms } from "./actions";

export const metadata: Metadata = { title: "Voice rooms" };

/** Discord's Move Members permission: needed to move someone into the room they made. */
const MOVE_MEMBERS = 1n << 24n;
const ADMINISTRATOR = 1n << 3n;

export default async function VoiceRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [config, plan, rooms, layout, perms, flash] = await Promise.all([
    getVoiceRooms(db, guild.id),
    getGuildPlan(db, guild.id),
    listVoiceRooms(db, guild.id),
    getServerLayout(guild.id).catch(() => null),
    botPermissions(guild.id),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const voice = layout
    ? [...layout.loose, ...layout.categories.flatMap((c) => c.channels)].filter(
        (c) => c.kind === "voice",
      )
    : [];
  const names = new Map(voice.map((c) => [c.id, c.name]));
  const owners = await memberNames(
    guild.id,
    rooms.map((r) => r.ownerId),
  );
  const canMove = perms === null || (perms & (MOVE_MEMBERS | ADMINISTRATOR)) !== 0n;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Voice rooms</h1>
          <p>
            Members join a "New room" voice channel and get their own, moved straight in. The owner
            can rename it, set a limit and choose who joins from Discord's channel settings. It
            passes on when the owner leaves and is deleted once empty.
          </p>
        </div>
        <HeadSwitch
          key={contentKey(config)}
          label="Voice rooms"
          name="enabled"
          form="settings-form"
          defaultChecked={config.enabled}
        />
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
      {!canMove ? (
        <div className="notice" role="alert">
          Garrison can't move members yet: give its role the Move Members permission (Server
          Settings, Roles), or add Garrison again from the server list to accept the new permission.
        </div>
      ) : null}

      <div className="page-split">
        <div className="page-split__main">
          <section className="g-card table-card" aria-labelledby="open-rooms">
            <div className="table-card__head">
              <h2 className="card-title" id="open-rooms">
                Open now <span className="count">{rooms.length}</span>
              </h2>
            </div>
            {rooms.length ? (
              <ul className="seats-list voice-rooms">
                {rooms.map((r) => (
                  <li key={r.channelId}>
                    <span>{names.get(r.channelId) ?? "Room"}</span>
                    <span className="muted">
                      {owners.get(r.ownerId) ?? "Someone"} · opened {ago(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact mark="groups" title="No rooms open">
                Rooms appear here while someone's in them. They're deleted once everyone leaves.
              </EmptyState>
            )}
          </section>
        </div>
        <aside className="page-split__side" aria-label="Settings">
          <AutoSaveCard
            id="settings"
            title="Voice rooms"
            action={saveVoiceRooms}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey(config)}
            saveLabel="Save voice rooms"
          >
            <p className="g-help">Off leaves rooms already open until they empty.</p>
            <div className="card-col">
              <CheckList
                name="creatorChannelIds"
                label="Join to create"
                value={config.creatorChannelIds}
                options={voice.map((c) => ({ id: c.id, label: c.name }))}
                help={
                  <>
                    Make a voice channel named "New room" (or anything) and tick it here. Free: one;
                    Pro: up to {ent["voice.creators"] > 1 ? ent["voice.creators"] : 5}.{" "}
                    {ent["voice.creators"] > 1 ? null : <ProTag on={false} />}
                  </>
                }
              />
              <div className="card-col">
                <label className="g-field" htmlFor="nameTemplate">
                  <span className="field-label">
                    Room name <ProTag on={ent["voice.names"]} />
                  </span>
                  <input
                    className="g-input"
                    id="nameTemplate"
                    name="nameTemplate"
                    maxLength={VOICE_LIMITS.name}
                    defaultValue={config.nameTemplate ?? ""}
                    placeholder={STANDARD_ROOM_NAME}
                  />
                  <span className="g-help">
                    <code>{"{user}"}</code> is the owner's name. Empty: "{STANDARD_ROOM_NAME}".
                  </span>
                </label>
                <label className="g-field" htmlFor="userLimit">
                  <span>Member limit</span>
                  <input
                    className="g-input"
                    id="userLimit"
                    name="userLimit"
                    type="number"
                    min={0}
                    max={VOICE_LIMITS.userLimit}
                    defaultValue={config.userLimit}
                  />
                  <span className="g-help">
                    0 means no limit. Owners can change it on their room.
                  </span>
                </label>
                <label className="g-field" htmlFor="categoryId">
                  <span>Rooms go in</span>
                  <select
                    className="g-input"
                    id="categoryId"
                    name="categoryId"
                    defaultValue={config.categoryId ?? ""}
                  >
                    <option value="">The creator channel's category</option>
                    {(layout?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </AutoSaveCard>
        </aside>
      </div>
    </>
  );
}
