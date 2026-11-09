import { getLeaderboard, getRanksSettings, levelForXp, listRankRewards } from "@garrison/db";
import type { Metadata } from "next";
import { Art } from "@/components/Art";
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
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { REWARD_ROWS } from "@/lib/settings-schema";
import { saveRanks, saveRewards } from "../settings/actions";

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
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [settings, top, rewards, roles, channels] = await Promise.all([
    getRanksSettings(db, guild.id),
    getLeaderboard(db, guild.id, 25),
    listRankRewards(db, guild.id),
    listGuildRoles(guild.id).catch(() => []),
    listTextChannels(guild.id).catch(() => []),
  ]);
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
              ? "Members earn XP for chatting, once a minute at most."
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

      <SettingsPanel
        title="Ranks settings"
        open={isEditing(query, "settings")}
        facts={[
          { label: "XP", value: settings.enabled ? "On" : "Off" },
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

      <div className="grid-cards">
        <div className="g-card table-card">
          <div className="table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  {["Rank", "Member", "Level", "XP", "Messages"].map((h) => (
                    <th key={h} scope="col">
                      <span className="g-label">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((m, i) => (
                  <tr key={m.userId}>
                    <td className="mono">#{i + 1}</td>
                    <td>{m.username || <span className="mono">{m.userId}</span>}</td>
                    <td>
                      {m.level}{" "}
                      <span className="mono">
                        · {Math.floor((levelForXp(m.xp).intoLevel / levelForXp(m.xp).needed) * 100)}
                        %
                      </span>
                    </td>
                    <td className="mono">{m.xp.toLocaleString("en-US")}</td>
                    <td className="mono">{m.messages.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {top.length === 0 ? (
              <div className="table-card__head muted">
                <Art slot="empty" className="empty-art" decorative />
                Nobody has XP yet.
              </div>
            ) : null}
          </div>
        </div>
        <form
          action={saveRewards}
          id="rewards"
          className="g-card card-col"
          key={JSON.stringify(rewards)}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <span className="g-label">Level rewards</span>
          <p className="g-help">
            Members get the role when they reach the level, and keep it. Roles with admin or
            moderation powers aren't offered. Garrison's role must sit above these roles.
          </p>
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
          <button type="submit" className="g-btn g-btn--primary">
            Save rewards
          </button>
          <p className="g-help">Every change is in Settings history and can be undone.</p>
        </form>
      </div>
    </>
  );
}
