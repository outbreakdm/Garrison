import {
  entitlements,
  getEconomy,
  getGuildPlan,
  getShopPanel,
  listLedger,
  listPurchases,
  money,
  shopPanelWords,
  topWallets,
  type VerifyAnswer,
} from "@garrison/db";
import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { formatTime } from "@/components/format";
import { MemberAvatar } from "@/components/MemberAvatar";
import { HeadSwitch } from "@/components/ModuleHead";
import { ActivityLayout, SetupLayout } from "@/components/PageLayouts";
import { PageTabs, TabPanel } from "@/components/PageTabs";
import { PanelPostCard } from "@/components/panels/PanelPostCard";
import { RequestsPanel } from "@/components/RequestsPanel";
import { SettingsNotice } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels, memberNames, searchMembers } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { undoChange } from "../settings/actions";
import { saveEconomy, saveShopPanel } from "./actions";
import { EarningPanel, ShopPanel } from "./EconomyPanels";
import { ShopPanelEditor } from "./ShopPanelEditor";

export const metadata: Metadata = { title: "Economy" };

const SOURCE: Record<string, string> = {
  chat: "Chatting",
  voice: "Voice",
  daily: "Daily",
  level: "Level-up",
  give: "Given by staff",
  take: "Taken by staff",
  pay_in: "Paid by",
  pay_out: "Paid to",
  buy: "Bought",
  refund: "Refunded",
};

function Hidden({ guildId, kind }: { guildId: string; kind: string }) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="economy" />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
}

/** Economy's tabs: what's happening with the coins, then how they're earned and spent. */
const ECONOMY_TABS = ["activity", "setup"] as const;

export default async function EconomyPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild, role } = await requireGuildAccess(guildId, "economy");
  const query = await searchParams;
  const find = typeof query.find === "string" ? query.find.trim().slice(0, 32) : "";
  const db = await getDb();
  const [config, plan, top, ledger, waiting, roles, channels, found, flash, shopPanel] =
    await Promise.all([
      getEconomy(db, guild.id),
      getGuildPlan(db, guild.id),
      topWallets(db, guild.id, 10),
      listLedger(db, guild.id, { limit: 40 }),
      listPurchases(db, guild.id, { status: "waiting", limit: 20 }),
      listGuildRoles(guild.id).catch(() => []),
      listTextChannels(guild.id).catch(() => []),
      find ? searchMembers(guild.id, find).catch(() => null) : null,
      readFlash(),
      getShopPanel(db, guild.id),
    ]);
  const ent = entitlements(plan);
  const names = await memberNames(guild.id, [
    ...new Set([...top.map((w) => w.userId), ...ledger.map((l) => l.userId)]),
  ]);
  const stamp = contentKey(config);
  const manager = role === "manager";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Economy</h1>
          <p>Your server's own currency, earned by taking part and spent in your shop.</p>
        </div>
        <HeadSwitch
          key={stamp}
          label="Economy"
          name="enabled"
          form="settings-form"
          defaultChecked={config.enabled}
        />
      </div>

      <PageTabs
        label="Economy"
        tabs={[
          { id: "activity", label: "Activity", count: waiting.length },
          { id: "setup", label: "Setup" },
        ]}
      />
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
      <RequestsPanel
        guildId={guild.id}
        kinds={["economy_adjust", "economy_purchase", "post_shop_panel"]}
        query={query}
      />

      <TabPanel id="activity" tabs={ECONOMY_TABS}>
        {/* Activity: purchases waiting, who holds the most and every coin that moved; giving
            or taking coins is the tool beside them. */}
        <ActivityLayout
          main={
            <>
              {waiting.length ? (
                <section className="g-card card-col" id="waiting" aria-labelledby="waiting-title">
                  <div className="row-between">
                    <h2 className="card-title" id="waiting-title">
                      Waiting for staff <span className="count">{waiting.length}</span>
                    </h2>
                  </div>
                  <ul className="answers-list">
                    {waiting.map((p) => (
                      <li className="answers-list__item" data-status="waiting" key={p.id}>
                        <div className="answers-list__head">
                          <strong>{p.itemName}</strong>
                          <span className="muted">
                            {p.username} · {money(config.currency, p.price)} ·{" "}
                            {formatTime(p.createdAt)}
                          </span>
                        </div>
                        {Array.isArray(p.answers) && p.answers.length ? (
                          <dl className="sg-row__answers">
                            {(p.answers as VerifyAnswer[]).map((a) => (
                              <div key={a.label}>
                                <dt>{a.label}</dt>
                                <dd>{a.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {manager ? (
                          <div className="answers-list__actions">
                            {(["done", "refund"] as const).map((op) => (
                              <form action={requestAction} key={op}>
                                <Hidden guildId={guild.id} kind="economy_purchase" />
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="op" value={op} />
                                <button
                                  type="submit"
                                  className={
                                    op === "done"
                                      ? "g-btn g-btn--secondary g-btn--sm"
                                      : "g-btn g-btn--ghost g-btn--sm"
                                  }
                                >
                                  {op === "done" ? "Handed over" : "Refund"}
                                </button>
                              </form>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section className="g-card table-card" aria-labelledby="richest-title">
                <div className="table-card__head">
                  <h2 className="card-title" id="richest-title">
                    Richest
                  </h2>
                </div>
                {top.length ? (
                  <ol className="rich-list">
                    {top.map((w, i) => (
                      <li key={w.userId}>
                        <span className="rich-list__place">{i + 1}</span>
                        <span className="rich-list__name">{names.get(w.userId) ?? "A member"}</span>
                        <span className="rich-list__amount">
                          {money(config.currency, w.balance)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState compact mark="leaderboard" title="Nobody has any yet">
                    Members start earning once the economy is on.
                  </EmptyState>
                )}
              </section>
              <section className="g-card table-card" aria-labelledby="ledger-title">
                <div className="table-card__head">
                  <h2 className="card-title" id="ledger-title">
                    Ledger
                  </h2>
                  <span className="g-help">Chatting and voice add up into one line a day.</span>
                </div>
                {ledger.length ? (
                  <div className="table-wrap">
                    <table className="g-table">
                      <thead>
                        <tr>
                          {["When", "Member", "What", "Amount", "After"].map((h) => (
                            <th key={h} scope="col">
                              <span className="g-label">{h}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((l) => (
                          <tr key={l.id}>
                            <td className="mono">{formatTime(l.at)}</td>
                            <td>{names.get(l.userId) ?? "A member"}</td>
                            <td>
                              {SOURCE[l.source] ?? l.source}
                              {l.actorName && (l.source === "pay_in" || l.source === "pay_out")
                                ? ` ${l.actorName}`
                                : ""}
                              {l.reason ? <span className="muted"> · {l.reason}</span> : null}
                              {l.actorName && (l.source === "give" || l.source === "take") ? (
                                <span className="muted"> · by {l.actorName}</span>
                              ) : null}
                            </td>
                            <td className={`mono ${l.amount > 0 ? "tone-go" : "tone-caution"}`}>
                              {l.amount > 0 ? "+" : "−"}
                              {money(config.currency, Math.abs(l.amount))}
                            </td>
                            <td className="mono">{money(config.currency, l.balanceAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState compact mark="log" title="Nothing has moved yet">
                    Every coin earned, paid, spent, given or taken shows here.
                  </EmptyState>
                )}
              </section>
            </>
          }
          side={
            <section className="g-card card-col" id="adjust" aria-labelledby="adjust-title">
              <h2 className="card-title" id="adjust-title">
                Give or take
              </h2>
              {manager ? (
                <>
                  <search>
                    <form className="side-search" method="get" action="#adjust">
                      <label className="sr-only" htmlFor="economy-find">
                        Member name or user ID
                      </label>
                      <input
                        id="economy-find"
                        className="g-input"
                        name="find"
                        type="search"
                        maxLength={32}
                        required
                        placeholder="Name or user ID"
                        defaultValue={find}
                      />
                      <button type="submit" className="g-btn g-btn--secondary">
                        Find
                      </button>
                    </form>
                  </search>
                  {find ? (
                    found === null ? (
                      <span className="notice" role="alert">
                        Discord didn't answer. Try again in a moment.
                      </span>
                    ) : found.filter((m) => !m.bot).length ? (
                      <ul className="adjust-list">
                        {found
                          .filter((m) => !m.bot)
                          .slice(0, 5)
                          .map((m) => (
                            <li key={m.id}>
                              <span className="adjust-list__who">
                                <MemberAvatar name={m.name} src={m.avatar} />
                                {m.name}
                              </span>
                              <form action={requestAction} className="adjust-list__form">
                                <Hidden guildId={guild.id} kind="economy_adjust" />
                                <input type="hidden" name="userId" value={m.id} />
                                <select
                                  className="g-input g-input--sm"
                                  name="op"
                                  aria-label="Give or take"
                                >
                                  <option value="give">Give</option>
                                  <option value="take">Take</option>
                                </select>
                                <input
                                  className="g-input g-input--sm"
                                  name="amount"
                                  inputMode="numeric"
                                  required
                                  placeholder="Amount"
                                  aria-label="Amount"
                                />
                                <input
                                  className="g-input g-input--sm"
                                  name="reason"
                                  required
                                  maxLength={200}
                                  placeholder="Why"
                                  aria-label="Reason"
                                />
                                <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                                  Do it
                                </button>
                              </form>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="muted">Nobody's name starts with “{find}”.</p>
                    )
                  ) : (
                    <p className="g-help">
                      Find a member, then give or take with a reason. It's on the ledger, like
                      /money.
                    </p>
                  )}
                </>
              ) : (
                <p className="g-help">Only someone with Manage Server can give or take.</p>
              )}
            </section>
          }
        />
      </TabPanel>
      <TabPanel id="setup" tabs={ECONOMY_TABS}>
        <SetupLayout>
          <EarningPanel
            guildId={guild.id}
            currency={config.currency}
            earn={config.earn}
            noEarnChannelIds={config.noEarnChannelIds}
            channels={channels}
            pro={ent["economy.extras"]}
            action={saveEconomy}
            undo={undoChange}
            stamp={stamp}
          />
          <ShopPanel
            guildId={guild.id}
            shop={config.shop}
            currency={config.currency}
            roles={roles
              .filter((r) => !r.managed && !isDangerousRole(r.permissions))
              .map((r) => ({ id: r.id, name: r.name }))}
            channels={channels}
            staffChannelId={config.staffChannelId}
            limit={ent["economy.items"]}
            pro={ent["economy.extras"]}
            action={saveEconomy}
            undo={undoChange}
            stamp={stamp}
          />
          <ShopPanelEditor
            guildId={guild.id}
            saved={shopPanelWords(shopPanel)}
            lines={config.shop.slice(0, ent["economy.items"]).map((i) => {
              const gives =
                i.kind === "role"
                  ? `@${roles.find((r) => r.id === i.roleId)?.name ?? "a role"}${i.hours ? ` for ${i.hours} hours` : ""}`
                  : "handed over by staff";
              return `${i.emoji && !i.emoji.startsWith("<") ? `${i.emoji} ` : ""}**${i.name}** · ${money(config.currency, i.price)} · ${gives}`;
            })}
            channel={
              shopPanel.shopPanelChannelId
                ? (channels.find((c) => c.id === shopPanel.shopPanelChannelId)?.name ?? null)
                : null
            }
            action={saveShopPanel}
            undo={undoChange}
            stamp={contentKey({ t: shopPanel.shopPanelTitle, b: shopPanel.shopPanelBody })}
          />
          <PanelPostCard
            id="post-shop-panel"
            guildId={guild.id}
            page="economy"
            kind="post_shop_panel"
            channels={channels}
            posted={
              shopPanel.shopPanelChannelId && shopPanel.shopPanelMessageId
                ? {
                    channelId: shopPanel.shopPanelChannelId,
                    messageId: shopPanel.shopPanelMessageId,
                  }
                : null
            }
            suggested={channels.find((c) => /shop|store|market/i.test(c.name))?.id ?? null}
            blocked={
              !config.enabled
                ? "Turn the economy on first."
                : config.shop.length
                  ? null
                  : "Add something to the shop first."
            }
          />
        </SetupLayout>
      </TabPanel>
    </>
  );
}
