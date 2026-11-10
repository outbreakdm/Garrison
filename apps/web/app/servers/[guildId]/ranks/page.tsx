import { getLeaderboard, getRanksSettings, levelForXp, listRankRewards } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { CardHead, PageHead } from "@/components/PageHead";
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
import { PAGES } from "@/lib/pages";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { REWARD_ROWS } from "@/lib/settings-schema";
import { saveRanks, saveRewards } from "../settings/actions";

const ANNOUNCE: Record<string, string> = {
  off: "Off",
  same_channel: "Where they posted",
  channel: "One channel",
};

export const metadata: Metadata = { title: PAGES.ranks.title };

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
  // The rewards there are, and two blank rows to add more: not ten empty rows.
  const rewardRows = Math.min(REWARD_ROWS, Math.max(3, rewards.length + 2));
  return (
    <>
      <PageHead
        title={PAGES.ranks.title}
        description="Members earn XP for chatting, once a minute at most, and level up. Garrison counts who posted and when, never what they wrote."
      >
        <a className="g-btn g-btn--ghost" href="?edit=settings#settings">
          <GearIcon />
          Settings
        </a>
      </PageHead>
      <SettingsNotice query={query} />
      {settings.enabled ? null : (
        <div className="g-card empty">
          <span>
            <strong>Levels are off.</strong>{" "}
            <span className="muted">Nobody is earning XP. Everyone keeps what they have.</span>
          </span>
          <a className="g-btn g-btn--primary" href="?edit=settings#settings">
            Turn levels on
          </a>
        </div>
      )}

      <div className="ranks-grid">
        <section className="g-card table-card" aria-labelledby="board-title">
          <div className="table-card__head">
            <h2 id="board-title">Leaderboard</h2>
            <span className="g-help">The top 25 members by XP.</span>
          </div>
          <div className="table-wrap">
            <table className="g-table">
              <thead>
                <tr>
                  {["#", "Member", "Level", "XP", "Messages"].map((h) => (
                    <th key={h} scope="col">
                      <span className="g-label">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((m, i) => {
                  const lv = levelForXp(m.xp);
                  return (
                    <tr key={m.userId}>
                      <td className="mono">{i + 1}</td>
                      <td>
                        <Link href={`/servers/${guild.id}/watch/member/${m.userId}`}>
                          {m.username || `Member …${m.userId.slice(-4)}`}
                        </Link>
                      </td>
                      <td>
                        <span className="level">
                          <span>{m.level}</span>
                          <meter
                            className="fill__bar"
                            min={0}
                            max={lv.needed}
                            value={lv.intoLevel}
                            aria-label={`${Math.floor((lv.intoLevel / lv.needed) * 100)}% of the way to level ${m.level + 1}`}
                          />
                        </span>
                      </td>
                      <td className="mono">{m.xp.toLocaleString("en-US")}</td>
                      <td className="mono">{m.messages.toLocaleString("en-US")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {top.length === 0 ? (
              <div className="table-card__head muted">
                <Art slot="empty" className="empty-art" decorative />
                Nobody has XP yet.
              </div>
            ) : null}
          </div>
        </section>
        <form
          action={saveRewards}
          id="rewards"
          className="g-card card-col"
          key={JSON.stringify(rewards)}
        >
          <input type="hidden" name="guildId" value={guild.id} />
          <CardHead
            title="Level rewards"
            help="Members get the role when they reach the level, and keep it. Roles with admin or moderation powers aren't offered, and Garrison's role must sit above these roles."
          />
          <div className="reward-row reward-row--head" aria-hidden="true">
            <span className="g-label">At level</span>
            <span className="g-label">Give the role</span>
          </div>
          {Array.from({ length: rewardRows }, (_, i) => {
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
                  <option value="">{r ? "Remove this reward" : "Pick a role"}</option>
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
          {rewardRows < REWARD_ROWS ? (
            <p className="g-help">
              Need more? Save, and more blank rows appear, up to {REWARD_ROWS} rewards.
            </p>
          ) : null}
          <FormFoot label="Save rewards" guildId={guild.id} />
        </form>
      </div>

      <SettingsPanel
        title="Level settings"
        open={isEditing(query, "settings")}
        facts={[
          { label: "Earning XP", value: settings.enabled ? "On" : "Off" },
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
          <FormFoot label="Save level settings" guildId={guild.id} />
        </form>
      </SettingsPanel>
    </>
  );
}
