import {
  entitlements,
  getGuildPlan,
  getRoster,
  getStatRoles,
  readStatRoles,
  STAT_ROLES_MAX,
  STAT_SOURCES,
} from "@garrison/db";
import type { Metadata } from "next";
import { AddRow } from "@/components/AddRow";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { GameMark, linkDetail, providerLabel } from "@/components/GameMark";
import { ListHead } from "@/components/ListHead";
import { MemberAvatar } from "@/components/MemberAvatar";
import { HeadStatus } from "@/components/ModuleHead";
import { SetupLayout } from "@/components/PageLayouts";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { formAction } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { saveStatRoles } from "./actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const metadata: Metadata = { title: "Game accounts" };

/** Game accounts' tabs: who shared what, then the roles their stats earn. */
const ACCOUNT_TABS = ["shared", "rules"] as const;

export default async function BarracksPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [roster, rawRules, plan, roles, flash] = await Promise.all([
    getRoster(db, guild.id),
    getStatRoles(db, guild.id),
    getGuildPlan(db, guild.id),
    listGuildRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const rules = readStatRoles(rawRules);
  const givable = roles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const accounts = roster.reduce((n, m) => n + m.links.length, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Game accounts</h1>
          <p>
            Game accounts members chose to share here with /link. Verified accounts were proven
            through Discord or Battle.net; claimed ones weren't.
          </p>
        </div>
        <HeadStatus
          on={rules.length > 0}
          text={`${plural(accounts, "account")} shared · ${rules.length ? plural(rules.length, "stat role") : "no stat roles yet"}`}
          href={rules.length ? undefined : "#stat-roles"}
          action="Add one"
        />
      </div>
      <PageTabs
        label="Game accounts"
        tabs={[
          { id: "shared", label: "Shared here", count: roster.length },
          { id: "rules", label: "Roles from stats", count: rules.length },
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

      <TabPanel id="shared" tabs={ACCOUNT_TABS} className="activity">
        <ListHead
          title="By member"
          count={
            roster.length
              ? `${roster.length} ${roster.length === 1 ? "member" : "members"} · ${accounts} ${accounts === 1 ? "account" : "accounts"}`
              : undefined
          }
        />
        {roster.length ? (
          <ul className="roster-cards">
            {roster.map((m) => {
              const name = m.username || `Member ${m.userId.slice(-4)}`;
              return (
                <li className="g-card roster-card" key={m.userId}>
                  <div className="roster-card__head">
                    <MemberAvatar name={name} src={null} />
                    <strong>{name}</strong>
                    <span className="mono">{m.links.length}</span>
                  </div>
                  <ul className="game-list">
                    {m.links.map((l) => (
                      <li className="game-row" key={l.id}>
                        <GameMark provider={l.provider} small />
                        <span className="game-row__name">
                          <strong>{l.displayName}</strong>
                          <span>
                            {[providerLabel(l.provider), linkDetail(l.details)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span
                          className={`g-badge ${l.verified ? "g-badge--go" : "g-badge--caution"}`}
                        >
                          {l.verified ? "Verified" : "Claimed"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState mark="accounts" title="No game accounts shared here yet">
            Members run <code>/link</code> in this server to share the accounts on their Account
            page: Steam, Battle.net, Xbox, World of Warcraft, RuneScape and more. Each member
            chooses, and can stop sharing at any time.
          </EmptyState>
        )}
      </TabPanel>
      <TabPanel id="rules" tabs={ACCOUNT_TABS}>
        <SetupLayout index={false}>
          <section className="g-card card-col" id="stat-roles" aria-labelledby="stat-roles-title">
            <div className="card-head">
              <h2 className="card-title" id="stat-roles-title">
                Roles from game stats
              </h2>
              <ProTag on={ent["barracks.statRoles"]} />
            </div>
            <form
              action={formAction(saveStatRoles)}
              className="settings-form"
              key={JSON.stringify(rules)}
            >
              <input type="hidden" name="guildId" value={guild.id} />
              <p className="g-help">
                Members get the role while an account they share here meets the rule, and lose it
                when none does (or they stop sharing). Checked every 30 minutes and whenever someone
                links. Claimed accounts count too, so use these for flair, not for access.
                {rules.length && !ent["barracks.statRoles"] ? " Saved on Pro, paused on Free." : ""}
              </p>
              <div className="boost-rows" id="stat-rows">
                {Array.from({ length: Math.min(STAT_ROLES_MAX, rules.length + 2) }, (_, i) => {
                  const r = rules[i];
                  const locked = !ent["barracks.statRoles"] && !r;
                  return (
                    <div
                      className="stat-row"
                      key={r ? `${r.source}-${r.roleId}-${r.min}` : `new-${i}`}
                      hidden={i > rules.length}
                    >
                      <select
                        className="g-input"
                        name={`rule${i}_source`}
                        aria-label={`Rule ${i + 1} game stat`}
                        defaultValue={r?.source ?? "osrs:totalLevel"}
                        disabled={locked}
                      >
                        {Object.entries(STAT_SOURCES).map(([value, s]) => (
                          <option key={value} value={value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="g-input"
                        name={`rule${i}_min`}
                        type="number"
                        min={1}
                        max={3000}
                        aria-label={`Rule ${i + 1} at least`}
                        placeholder="At least"
                        defaultValue={r?.min ?? ""}
                        disabled={locked}
                      />
                      <select
                        className="g-input"
                        name={`rule${i}_role`}
                        aria-label={`Rule ${i + 1} role`}
                        defaultValue={r?.roleId ?? ""}
                        disabled={locked}
                      >
                        <option value="">No rule</option>
                        {r && !givable.some((g) => g.id === r.roleId) ? (
                          <option value={r.roleId}>
                            @{roleName.get(r.roleId) ?? "deleted role"}
                          </option>
                        ) : null}
                        {givable.map((g) => (
                          <option key={g.id} value={g.id}>
                            @{g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              {ent["barracks.statRoles"] ? <AddRow list="stat-rows" label="Add a rule" /> : null}
              <div className="form-foot">
                <button type="submit" className="g-btn g-btn--primary">
                  Save rules
                </button>
                <span className="g-help">
                  Saved together, since a rule needs its stat, number and role. Every change is in
                  Settings history and can be undone.
                </span>
              </div>
            </form>
          </section>
        </SetupLayout>
      </TabPanel>
    </>
  );
}
