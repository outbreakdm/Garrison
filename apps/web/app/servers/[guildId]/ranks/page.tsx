import {
  BOOST_MULTIPLIERS,
  BOOSTS_MAX,
  entitlements,
  getGuildPlan,
  getLeaderboard,
  getRanksSettings,
  isPresetBackground,
  levelForXp,
  listRankRewards,
  RANK_BACKGROUNDS,
  readBoosts,
  readRankCard,
} from "@garrison/db";
import type { Metadata } from "next";
import { Art } from "@/components/Art";
import { ProTag } from "@/components/cards/CardEditor";
import { MemberAvatar } from "@/components/MemberAvatar";
import {
  ChannelSelect,
  FormFoot,
  GearIcon,
  isEditing,
  SettingsNotice,
  SettingsPanel,
  Switch,
} from "@/components/settings";
import { getDb } from "@/lib/db";
import { getServerLayout, listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { REWARD_ROWS } from "@/lib/settings-schema";
import { saveRanks, saveRewards } from "../settings/actions";
import { saveBoosts, saveRankCard } from "./actions";
import { RankCardEditor } from "./RankCardEditor";

const ANNOUNCE: Record<string, string> = {
  off: "Off",
  same_channel: "Where they posted",
  channel: "One channel",
};

export const metadata: Metadata = { title: "Ranks" };

export default async function RanksPage({
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
  const [settings, top, rewards, roles, channels, plan, flash, layout] = await Promise.all([
    getRanksSettings(db, guild.id),
    getLeaderboard(db, guild.id, 25),
    listRankRewards(db, guild.id),
    listGuildRoles(guild.id).catch(() => []),
    listTextChannels(guild.id).catch(() => []),
    getGuildPlan(db, guild.id),
    readFlash(),
    getServerLayout(guild.id).catch(() => null),
  ]);
  const ent = entitlements(plan);
  const boosts = readBoosts(settings.boosts);
  const placeName = new Map<string, string>([
    ...(layout?.roles ?? []).map((r) => [`role:${r.id}`, `@${r.name}`] as [string, string]),
    ...(layout?.categories ?? []).map(
      (c) => [`channel:${c.id}`, `${c.name} (category)`] as [string, string],
    ),
    ...[...(layout?.loose ?? []), ...(layout?.categories ?? []).flatMap((c) => c.channels)].map(
      (c) => [`channel:${c.id}`, `${c.kind === "voice" ? "🔊" : "#"}${c.name}`] as [string, string],
    ),
  ]);
  const multLabel = (m: number) => (m === 0 ? "No XP" : `×${m}`);
  const card = readRankCard(settings.card);
  const cardFacts = [
    {
      label: "Background",
      value: isPresetBackground(card.background)
        ? (RANK_BACKGROUNDS[card.background]?.label ?? "Garrison")
        : "Your image",
    },
    {
      label: "Details",
      value: card.fields.length ? card.fields.map((f) => f.label).join(", ") : "None",
    },
    ...(card.background !== "garrison" || card.accent || card.fields.length || card.showLinked
      ? ent["ranks.cards"]
        ? []
        : [{ label: "Pro look", value: "Paused on Free" }]
      : []),
  ];
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const grantable = roles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const announceChannel = channels.find((c) => c.id === settings.announceChannelId);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p>
            {settings.enabled
              ? settings.voiceXp
                ? "Members earn XP for chatting and for time in voice, once a minute at most."
                : "Members earn XP for chatting, once a minute at most."
              : "Ranks are off: members earn no XP."}{" "}
            Garrison counts who posted and when, never what they wrote.
          </p>
        </div>
        <a className="g-btn g-btn--secondary" href="?edit=settings#settings">
          <GearIcon />
          Ranks settings
        </a>
      </div>
      <SettingsNotice query={query} />
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

      <SettingsPanel
        title="Ranks settings"
        open={isEditing(query, "settings")}
        facts={[
          { label: "XP", value: settings.enabled ? "On" : "Off" },
          { label: "Voice", value: settings.voiceXp ? "On" : "Off" },
          {
            label: "Level-ups",
            value:
              settings.announce === "channel" && announceChannel
                ? `#${announceChannel.name}`
                : (ANNOUNCE[settings.announce] ?? settings.announce),
          },
        ]}
      >
        <form action={saveRanks} className="settings-form" key={settings.updatedAt.getTime()}>
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="settings-grid">
            <Switch
              name="enabled"
              defaultChecked={settings.enabled}
              label="Give XP for messages"
              help="Turning this off keeps everyone's XP; nobody earns more."
            />
            <Switch
              name="voiceXp"
              defaultChecked={settings.voiceXp}
              label="Give XP for time in voice"
              help="10 XP a minute, with at least one other person in the channel. Not while deafened or in the AFK channel."
            />
            <div className="card-col">
              <label className="g-field" htmlFor="announce">
                <span>Level-up messages</span>
                <select
                  className="g-input"
                  id="announce"
                  name="announce"
                  defaultValue={settings.announce}
                >
                  <option value="same_channel">Where the member posted</option>
                  <option value="channel">In one channel</option>
                  <option value="off">Don't announce</option>
                </select>
              </label>
              <label className="g-field" htmlFor="announceChannelId">
                <span>Level-up channel</span>
                <ChannelSelect
                  name="announceChannelId"
                  value={settings.announceChannelId}
                  channels={channels}
                  none="Pick a channel"
                />
                <span className="g-help">Only used when level-ups go to one channel.</span>
              </label>
            </div>
          </div>
          <FormFoot label="Save Ranks settings" guildId={guild.id} />
        </form>
      </SettingsPanel>

      <SettingsPanel id="card" title="Rank card" open={isEditing(query, "card")} facts={cardFacts}>
        <RankCardEditor
          key={contentKey(card)}
          guildId={guild.id}
          saved={card}
          ent={ent}
          sampleName={session.username}
          planHref={`/servers/${guild.id}/plan`}
          action={saveRankCard}
        />
      </SettingsPanel>

      <SettingsPanel
        id="boosts"
        title="XP boosts"
        open={isEditing(query, "boosts")}
        facts={[
          {
            label: "Boosts",
            value: boosts.length
              ? boosts
                  .map(
                    (b) =>
                      `${placeName.get(`${b.kind}:${b.id}`) ?? "Removed"} ${multLabel(b.multiplier)}`,
                  )
                  .join(", ")
              : "None",
          },
          ...(boosts.length && !ent["ranks.boosts"]
            ? [{ label: "Pro", value: "Paused on Free" }]
            : []),
        ]}
      >
        <form action={saveBoosts} className="settings-form" key={JSON.stringify(boosts)}>
          <input type="hidden" name="guildId" value={guild.id} />
          <p className="g-help">
            More XP for a role (boosters, event winners) or in a channel or category, or none at all
            in places like a bot-commands channel. With several that apply, the biggest counts, and
            No XP always wins. <ProTag on={ent["ranks.boosts"]} />
          </p>
          <div className="boost-rows">
            {Array.from({ length: Math.min(BOOSTS_MAX, boosts.length + 3) }, (_, i) => {
              const b = boosts[i];
              const value = b ? `${b.kind}:${b.id}` : "";
              return (
                <div className="boost-row" key={b ? value : `new-${i}`}>
                  <select
                    className="g-input"
                    name={`boost${i}_target`}
                    aria-label={`Boost ${i + 1} role or channel`}
                    defaultValue={value}
                    disabled={!ent["ranks.boosts"] && !b}
                  >
                    <option value="">No boost</option>
                    {b && !placeName.has(value) ? <option value={value}>Removed</option> : null}
                    <optgroup label="Roles">
                      {(layout?.roles ?? [])
                        .filter((r) => !r.managed)
                        .map((r) => (
                          <option key={r.id} value={`role:${r.id}`}>
                            @{r.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Categories">
                      {(layout?.categories ?? []).map((c) => (
                        <option key={c.id} value={`channel:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Channels">
                      {[
                        ...(layout?.loose ?? []),
                        ...(layout?.categories ?? []).flatMap((c) => c.channels),
                      ]
                        .filter((c) => c.kind !== "other")
                        .map((c) => (
                          <option key={c.id} value={`channel:${c.id}`}>
                            {c.kind === "voice" ? "🔊" : "#"}
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <select
                    className="g-input"
                    name={`boost${i}_mult`}
                    aria-label={`Boost ${i + 1} multiplier`}
                    defaultValue={String(b?.multiplier ?? 2)}
                    disabled={!ent["ranks.boosts"] && !b}
                  >
                    {BOOST_MULTIPLIERS.map((m) => (
                      <option key={m} value={m}>
                        {multLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <FormFoot label="Save boosts" guildId={guild.id} />
        </form>
      </SettingsPanel>

      <div className="ranks-layout">
        <section className="g-card table-card" aria-labelledby="board-title">
          <div className="table-card__head card-head">
            <h2 className="card-title" id="board-title">
              Most XP
            </h2>
            <span className="g-help">Members check theirs with /rank in Discord.</span>
          </div>
          {top.length ? (
            <ol className="board">
              <li className="board__row board__row--head" aria-hidden="true">
                <span className="g-label">Rank</span>
                <span className="g-label">Member</span>
                <span className="g-label">Level</span>
                <span className="g-label">XP</span>
                <span className="g-label">Messages</span>
              </li>
              {top.map((m, i) => {
                const lv = levelForXp(m.xp);
                const name = m.username || `Member ${m.userId.slice(-4)}`;
                return (
                  <li
                    key={m.userId}
                    className={`board__row ${i < 3 ? "board__row--top" : ""} ${i === 0 ? "board__row--first" : ""}`}
                  >
                    <span className="board__rank" title={`Rank ${i + 1}`}>
                      {i + 1}
                    </span>
                    <span className="board__who">
                      <MemberAvatar name={name} src={null} />
                      <span>{name}</span>
                    </span>
                    <span className="board__level">
                      <span className="board__lv">Lv {m.level}</span>
                      <progress
                        className="xpbar"
                        value={lv.intoLevel}
                        max={lv.needed}
                        aria-label={`${Math.floor((lv.intoLevel / lv.needed) * 100)}% of the way to level ${m.level + 1}`}
                      />
                    </span>
                    <span className="board__xp">{m.xp.toLocaleString("en-US")} XP</span>
                    <span className="board__msgs">{m.messages.toLocaleString("en-US")}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="board__empty">
              <Art slot="empty" className="empty-art" decorative />
              <p>
                Nobody has XP yet.
                {settings.enabled
                  ? " Members earn it by chatting."
                  : " Turn Ranks on in Ranks settings and members start earning it."}
              </p>
            </div>
          )}
        </section>
        <form
          action={saveRewards}
          id="rewards"
          className="g-card card-col"
          key={JSON.stringify(rewards)}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <h2 className="card-title">Level rewards</h2>
          <p className="g-help">
            Members get the role when they reach the level, and keep it. Roles with admin or
            moderation powers aren't offered. Garrison's role must sit above these roles.
          </p>
          <div className="reward-rows">
            {Array.from({ length: REWARD_ROWS }, (_, i) => {
              const r = rewards[i];
              return (
                <div className="reward-row" key={r ? `lvl-${r.level}` : `new-${i}`}>
                  <input
                    className="g-input"
                    name={`reward${i}_level`}
                    type="number"
                    min={1}
                    max={500}
                    placeholder="Level"
                    aria-label={`Reward ${i + 1} level`}
                    defaultValue={r?.level ?? ""}
                  />
                  <select
                    className="g-input"
                    name={`reward${i}_role`}
                    aria-label={`Reward ${i + 1} role`}
                    defaultValue={r?.roleId ?? ""}
                  >
                    <option value="">No reward</option>
                    {r?.roleId && !grantable.some((g) => g.id === r.roleId) ? (
                      <option value={r.roleId}>@{roleName.get(r.roleId) ?? "deleted role"}</option>
                    ) : null}
                    {grantable.map((g) => (
                      <option key={g.id} value={g.id}>
                        @{g.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <button type="submit" className="g-btn g-btn--primary">
            Save rewards
          </button>
          <p className="g-help">Every change is in Settings history and can be undone.</p>
        </form>
      </div>
    </>
  );
}
