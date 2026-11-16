import {
  coinNumber,
  entitlements,
  getEconomy,
  getGuildPlan,
  getWallet,
  listLedger,
  listPurchases,
  money,
  walletRank,
} from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { listGuildRoles } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { memberSpace } from "@/lib/member";
import { buyFromShop } from "../actions";

export const metadata: Metadata = { title: "Wallet" };

const SOURCE: Record<string, string> = {
  chat: "Chatting",
  voice: "Voice",
  daily: "Daily claim",
  level: "Level-up",
  give: "From staff",
  take: "Taken by staff",
  pay_in: "Paid by",
  pay_out: "Paid to",
  buy: "Bought",
  refund: "Refunded",
};
const STATUS: Record<string, string> = {
  done: "Yours",
  waiting: "Staff will hand it over",
  refunded: "Refunded",
  expired: "Ran out",
};

/**
 * A member's own coins in this server: balance and place, the shop with Buy, what they bought
 * and their recent history. Only their own; shows while the economy is on.
 */
export default async function WalletPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { session, guild, show } = await memberSpace(guildId);
  if (!show.wallet) notFound();
  const db = await getDb();
  const [config, plan, wallet, history, bought, roles, flash] = await Promise.all([
    getEconomy(db, guild.id),
    getGuildPlan(db, guild.id),
    getWallet(db, guild.id, session.userId),
    listLedger(db, guild.id, { userId: session.userId, limit: 20 }),
    listPurchases(db, guild.id, { userId: session.userId, limit: 20 }),
    listGuildRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const rank = await walletRank(db, guild.id, wallet.balance);
  const items = config.shop.slice(0, entitlements(plan)["economy.items"]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="member__page">
      <div className="page-head">
        <div>
          <h1>Wallet</h1>
          <p>
            Earn {config.currency.name.toLowerCase()} by taking part in {guild.name}, and spend them
            in its shop.
          </p>
        </div>
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

      <section className="stat-tiles" aria-label="Your coins">
        <div className="g-card stat-tile">
          <span className="stat-tile__label">Balance</span>
          <span className="stat-tile__value">{money(config.currency, wallet.balance)}</span>
          <span className="stat-tile__foot">
            <span className="g-help">
              {wallet.balance > 0 ? `#${coinNumber(rank)} in the server` : "Start by chatting"}
            </span>
          </span>
        </div>
        {config.earn.daily.on ? (
          <div className="g-card stat-tile">
            <span className="stat-tile__label">Daily claim</span>
            <span className="stat-tile__value">
              {wallet.lastDaily === today ? "Claimed" : "Ready"}
            </span>
            <span className="stat-tile__foot">
              <span className="g-help">
                {wallet.lastDaily === today
                  ? `Streak: ${wallet.streak} ${wallet.streak === 1 ? "day" : "days"}. Back tomorrow (UTC).`
                  : "Use /daily in Discord."}
              </span>
            </span>
          </div>
        ) : null}
      </section>

      <section className="g-card card-col" aria-labelledby="shop-title">
        <h2 className="card-title" id="shop-title">
          Shop
        </h2>
        {items.length ? (
          <ul className="shop-list">
            {items.map((item) => {
              const short = item.price > wallet.balance;
              return (
                <li key={item.id} className="shop-list__item">
                  <span className="shop-list__emoji" aria-hidden="true">
                    {item.emoji && !item.emoji.startsWith("<") ? item.emoji : "◆"}
                  </span>
                  <span className="shop-list__what">
                    <strong>{item.name}</strong>
                    <span className="muted">
                      {item.kind === "role"
                        ? `The @${roleName.get(item.roleId ?? "") ?? "role"} role${item.hours ? ` for ${item.hours} hours` : ""}`
                        : "Handed over by staff"}
                      {item.description ? ` · ${item.description}` : ""}
                    </span>
                  </span>
                  <span className="shop-list__price">{money(config.currency, item.price)}</span>
                  <form action={buyFromShop}>
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      type="submit"
                      className="g-btn g-btn--secondary g-btn--sm"
                      disabled={short}
                      title={short ? "Not enough yet" : undefined}
                    >
                      Buy
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="g-help">The shop is empty for now.</p>
        )}
      </section>

      {bought.length ? (
        <section className="g-card card-col" aria-labelledby="bought-title">
          <h2 className="card-title" id="bought-title">
            What you bought
          </h2>
          <ul className="shop-list">
            {bought.map((p) => (
              <li key={p.id} className="shop-list__item">
                <span className="shop-list__what">
                  <strong>{p.itemName}</strong>
                  <span className="muted">
                    {STATUS[p.status] ?? p.status}
                    {p.expiresAt && p.status === "done"
                      ? ` · until ${formatTime(p.expiresAt)}`
                      : ""}
                  </span>
                </span>
                <span className="shop-list__price">{money(config.currency, p.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="g-card table-card" aria-labelledby="history-title">
        <div className="table-card__head">
          <h2 className="card-title" id="history-title">
            History
          </h2>
        </div>
        {history.length ? (
          <ul className="rich-list">
            {history.map((l) => (
              <li key={l.id}>
                <span className={`rich-list__place ${l.amount > 0 ? "tone-go" : "tone-caution"}`}>
                  {l.amount > 0 ? "+" : "−"}
                </span>
                <span className="rich-list__name">
                  {SOURCE[l.source] ?? l.source}
                  {l.actorName && (l.source === "pay_in" || l.source === "pay_out")
                    ? ` ${l.actorName}`
                    : ""}
                  {l.reason ? ` · ${l.reason}` : ""}
                  <span className="muted"> · {formatTime(l.at)}</span>
                </span>
                <span className="rich-list__amount">
                  {money(config.currency, Math.abs(l.amount))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="g-help table-card__foot">
            Nothing yet. Coins you earn and spend show here.
          </p>
        )}
      </section>
    </div>
  );
}
