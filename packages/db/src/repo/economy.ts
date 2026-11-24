import { and, count, desc, eq, gt, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  dailyAmount,
  type EarnRules,
  readEconomy,
  readShopPanel,
  type ShopItem,
  type ShopPanelConfig,
} from "../economy";
import type { PanelPlace } from "../panels";
import {
  economyLedger,
  economyPurchases,
  economySettings,
  type LedgerRow,
  type Purchase,
  type Wallet,
  wallets,
} from "../schema";
import type { VerifyAnswer } from "../verify-questions";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type LedgerSource = LedgerRow["source"];

/** Sources that add up into one ledger row per member per day. */
const SUMMED = new Set(["chat", "voice"]);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** The shop panel's words and where it's posted. */
export async function getShopPanel(db: Db, guildId: string): Promise<ShopPanelConfig> {
  const [row] = await db.select().from(economySettings).where(eq(economySettings.guildId, guildId));
  return readShopPanel(row ?? null);
}

/** Where the shop panel now is: the bot records it after posting. Not a setting: no history. */
export async function setShopPanelMessage(db: Db, guildId: string, at: PanelPlace | null) {
  await db
    .update(economySettings)
    .set({ shopPanelChannelId: at?.channelId ?? null, shopPanelMessageId: at?.messageId ?? null })
    .where(eq(economySettings.guildId, guildId));
}

/** How many of each stocked item are gone (refunds put one back), for the panel's "left". */
export async function shopSold(db: Db, guildId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ itemId: economyPurchases.itemId, n: count() })
    .from(economyPurchases)
    .where(and(eq(economyPurchases.guildId, guildId), ne(economyPurchases.status, "refunded")))
    .groupBy(economyPurchases.itemId);
  return new Map(rows.map((r) => [r.itemId, Number(r.n)]));
}

export async function getEconomy(db: Db, guildId: string) {
  const [row] = await db.select().from(economySettings).where(eq(economySettings.guildId, guildId));
  return readEconomy(row ?? null);
}

/** A member's wallet, with zeros when they have none yet. */
export async function getWallet(db: Db, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)));
  return {
    balance: row?.balance ?? 0,
    streak: row?.streak ?? 0,
    lastDaily: row?.lastDaily ?? null,
  };
}

/** Where a balance places in the server: 1 for the richest. */
export async function walletRank(db: Db, guildId: string, balance: number) {
  const [row] = await db
    .select({ n: count() })
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), gt(wallets.balance, balance)));
  return (row?.n ?? 0) + 1;
}

export async function topWallets(db: Db, guildId: string, limit = 10): Promise<Wallet[]> {
  return db
    .select()
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), gt(wallets.balance, 0)))
    .orderBy(desc(wallets.balance))
    .limit(limit);
}

export async function listLedger(
  db: Db,
  guildId: string,
  opts: { userId?: string; limit?: number } = {},
): Promise<LedgerRow[]> {
  return db
    .select()
    .from(economyLedger)
    .where(
      and(
        eq(economyLedger.guildId, guildId),
        opts.userId ? eq(economyLedger.userId, opts.userId) : sql`true`,
      ),
    )
    .orderBy(desc(economyLedger.at))
    .limit(opts.limit ?? 50);
}

export async function listPurchases(
  db: Db,
  guildId: string,
  opts: { status?: Purchase["status"]; userId?: string; limit?: number } = {},
): Promise<Purchase[]> {
  return db
    .select()
    .from(economyPurchases)
    .where(
      and(
        eq(economyPurchases.guildId, guildId),
        opts.status ? eq(economyPurchases.status, opts.status) : sql`true`,
        opts.userId ? eq(economyPurchases.userId, opts.userId) : sql`true`,
      ),
    )
    .orderBy(desc(economyPurchases.createdAt))
    .limit(opts.limit ?? 50);
}

/** The wallet row, created at zero if needed, locked until the transaction ends. */
async function lockWallet(tx: Tx, guildId: string, userId: string): Promise<Wallet> {
  await tx.insert(wallets).values({ guildId, userId }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
    .for("update");
  if (!row) throw new Error("Wallet row missing after insert");
  return row;
}

interface Entry {
  source: LedgerSource;
  reason?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  itemId?: string | null;
}

/** Change a locked wallet and write the ledger, in the caller's transaction. */
async function write(
  tx: Tx,
  wallet: Wallet,
  amount: number,
  entry: Entry,
  now: Date,
  extra: Partial<typeof wallets.$inferInsert> = {},
) {
  const balance = wallet.balance + amount;
  await tx
    .update(wallets)
    .set({ balance, updatedAt: now, ...extra })
    .where(and(eq(wallets.guildId, wallet.guildId), eq(wallets.userId, wallet.userId)));
  const row = {
    guildId: wallet.guildId,
    userId: wallet.userId,
    amount,
    balanceAfter: balance,
    source: entry.source,
    reason: entry.reason ?? null,
    actorId: entry.actorId ?? null,
    actorName: entry.actorName ?? null,
    itemId: entry.itemId ?? null,
    at: now,
  };
  if (SUMMED.has(entry.source)) {
    await tx
      .insert(economyLedger)
      .values({ ...row, day: dayOf(now) })
      .onConflictDoUpdate({
        target: [
          economyLedger.guildId,
          economyLedger.userId,
          economyLedger.source,
          economyLedger.day,
        ],
        targetWhere: isNotNull(economyLedger.day),
        set: {
          amount: sql`${economyLedger.amount} + excluded.amount`,
          balanceAfter: balance,
          at: now,
        },
      });
  } else await tx.insert(economyLedger).values(row);
  return balance;
}

export type Moved =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient"; balance: number };

/**
 * Add to a balance or take from it. Taking more than there is changes nothing and says
 * "insufficient" with what there is.
 */
export async function adjustBalance(
  db: Db,
  input: { guildId: string; userId: string; amount: number } & Entry,
  now = new Date(),
): Promise<Moved> {
  if (!Number.isInteger(input.amount) || input.amount === 0)
    throw new Error("Amounts are whole and not zero");
  return db.transaction(async (tx) => {
    const wallet = await lockWallet(tx, input.guildId, input.userId);
    if (wallet.balance + input.amount < 0)
      return { ok: false, reason: "insufficient", balance: wallet.balance };
    return { ok: true, balance: await write(tx, wallet, input.amount, input, now) };
  });
}

export type Daily =
  | { ok: true; amount: number; streak: number; balance: number }
  | { ok: false; next: Date };

/** The daily claim: once per UTC day, a streak while no day is missed. */
export async function claimDaily(
  db: Db,
  guildId: string,
  userId: string,
  rules: EarnRules["daily"],
  now = new Date(),
): Promise<Daily> {
  return db.transaction(async (tx) => {
    const wallet = await lockWallet(tx, guildId, userId);
    const today = dayOf(now);
    if (wallet.lastDaily === today) {
      const next = new Date(`${today}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return { ok: false, next };
    }
    const yesterday = dayOf(new Date(now.getTime() - 86_400_000));
    const streak = wallet.lastDaily === yesterday ? wallet.streak + 1 : 1;
    const amount = dailyAmount(rules, streak);
    const balance =
      amount > 0
        ? await write(tx, wallet, amount, { source: "daily" }, now, { streak, lastDaily: today })
        : wallet.balance;
    if (amount === 0)
      await tx
        .update(wallets)
        .set({ streak, lastDaily: today })
        .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)));
    return { ok: true, amount, streak, balance };
  });
}

export type Paid =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient"; balance: number }
  | { ok: false; reason: "cap"; left: number };

/**
 * One member pays another, within the payer's daily cap. Both wallets are locked in the same
 * order every time, so two payments the other way at once can't deadlock.
 */
export async function payMember(
  db: Db,
  input: {
    guildId: string;
    from: { id: string; name: string };
    to: { id: string; name: string };
    amount: number;
    dailyCap: number;
  },
  now = new Date(),
): Promise<Paid> {
  if (input.from.id === input.to.id) throw new Error("Can't pay yourself");
  return db.transaction(async (tx) => {
    const [a, b] = [input.from.id, input.to.id].sort();
    const first = await lockWallet(tx, input.guildId, a as string);
    const second = await lockWallet(tx, input.guildId, b as string);
    const payer = first.userId === input.from.id ? first : second;
    const payee = first.userId === input.from.id ? second : first;
    const today = dayOf(now);
    const paid = payer.paidDay === today ? payer.paidToday : 0;
    if (paid + input.amount > input.dailyCap)
      return { ok: false, reason: "cap", left: Math.max(0, input.dailyCap - paid) };
    if (payer.balance < input.amount)
      return { ok: false, reason: "insufficient", balance: payer.balance };
    const balance = await write(
      tx,
      payer,
      -input.amount,
      { source: "pay_out", actorId: input.to.id, actorName: input.to.name },
      now,
      { paidToday: paid + input.amount, paidDay: today },
    );
    await write(
      tx,
      payee,
      input.amount,
      {
        source: "pay_in",
        actorId: input.from.id,
        actorName: input.from.name,
      },
      now,
    );
    return { ok: true, balance };
  });
}

export type Bought =
  | { ok: true; purchase: Purchase; balance: number }
  | { ok: false; reason: "insufficient"; balance: number }
  | { ok: false; reason: "sold_out" | "limit" };

/**
 * Buy a shop item: the price comes off, a purchase is recorded (a role: done, given by the
 * caller, who refunds if Discord refuses; a staff item: waiting). Stock is counted under a
 * lock per item, so the last one can't be sold twice.
 */
export async function buyItem(
  db: Db,
  guildId: string,
  member: { id: string; username: string },
  item: ShopItem,
  now = new Date(),
  /** What the member answered to the item's question (shopAnswers). */
  answers: VerifyAnswer[] | null = null,
): Promise<Bought> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:shop:${guildId}:${item.id}`}))`,
    );
    const wallet = await lockWallet(tx, guildId, member.id);
    const sold = (where: ReturnType<typeof and>) =>
      tx
        .select({ n: count() })
        .from(economyPurchases)
        .where(where)
        .then((r) => r[0]?.n ?? 0);
    const live = and(
      eq(economyPurchases.guildId, guildId),
      eq(economyPurchases.itemId, item.id),
      ne(economyPurchases.status, "refunded"),
    );
    if (item.stock !== null && (await sold(live)) >= item.stock)
      return { ok: false, reason: "sold_out" };
    if (
      item.perMember !== null &&
      (await sold(and(live, eq(economyPurchases.userId, member.id)))) >= item.perMember
    )
      return { ok: false, reason: "limit" };
    if (wallet.balance < item.price)
      return { ok: false, reason: "insufficient", balance: wallet.balance };
    const balance = await write(
      tx,
      wallet,
      -item.price,
      { source: "buy", itemId: item.id, reason: item.name },
      now,
    );
    const [purchase] = await tx
      .insert(economyPurchases)
      .values({
        guildId,
        userId: member.id,
        username: member.username,
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        kind: item.kind,
        roleId: item.kind === "role" ? item.roleId : null,
        expiresAt:
          item.kind === "role" && item.hours
            ? new Date(now.getTime() + item.hours * 3_600_000)
            : null,
        status: item.kind === "role" ? "done" : "waiting",
        answers,
        createdAt: now,
      })
      .returning();
    if (!purchase) throw new Error("Purchase insert returned no row");
    return { ok: true, purchase, balance };
  });
}

/**
 * Give the money back for a purchase: one waiting for staff, or a role Discord wouldn't give
 * (`failed`). Only one refund lands.
 */
export async function refundPurchase(
  db: Db,
  guildId: string,
  id: string,
  actor: { id: string; name: string } | null,
  { failed = false }: { failed?: boolean } = {},
  now = new Date(),
): Promise<Purchase | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(economyPurchases)
      .set({ status: "refunded", decidedBy: actor?.name ?? null })
      .where(
        and(
          eq(economyPurchases.guildId, guildId),
          eq(economyPurchases.id, id),
          inArray(economyPurchases.status, failed ? ["waiting", "done"] : ["waiting"]),
        ),
      )
      .returning();
    if (!row) return null;
    const wallet = await lockWallet(tx, guildId, row.userId);
    await write(
      tx,
      wallet,
      row.price,
      {
        source: "refund",
        itemId: row.itemId,
        reason: row.itemName,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
      },
      now,
    );
    return row;
  });
}

/** Staff handed a waiting item over. Only one decision lands. */
export async function completePurchase(db: Db, guildId: string, id: string, actor: string) {
  const [row] = await db
    .update(economyPurchases)
    .set({ status: "done", decidedBy: actor })
    .where(
      and(
        eq(economyPurchases.guildId, guildId),
        eq(economyPurchases.id, id),
        eq(economyPurchases.status, "waiting"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getPurchase(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(economyPurchases)
    .where(and(eq(economyPurchases.guildId, guildId), eq(economyPurchases.id, id)));
  return row ?? null;
}

export async function setPurchaseCard(
  db: Db,
  id: string,
  card: { channelId: string; messageId: string },
) {
  await db.update(economyPurchases).set(card).where(eq(economyPurchases.id, id));
}

/** Timed roles whose time is up, across servers. */
export async function dueTimedRoles(db: Db, now = new Date(), limit = 100): Promise<Purchase[]> {
  return db
    .select()
    .from(economyPurchases)
    .where(
      and(
        eq(economyPurchases.status, "done"),
        isNotNull(economyPurchases.expiresAt),
        lte(economyPurchases.expiresAt, now),
      ),
    )
    .limit(limit);
}

export async function markPurchaseExpired(db: Db, id: string) {
  await db
    .update(economyPurchases)
    .set({ status: "expired" })
    .where(and(eq(economyPurchases.id, id), eq(economyPurchases.status, "done")));
}

/** The ledger keeps a year (and a little more). */
export async function pruneEconomyLedger(db: Db, before: Date) {
  await db.delete(economyLedger).where(lt(economyLedger.at, before));
}

/** Servers with the economy on, and their earning rules, for the minute sweep. */
export async function listEnabledEconomies(db: Db, guildIds: string[]) {
  if (!guildIds.length) return [];
  const rows = await db
    .select({ guildId: economySettings.guildId, earn: economySettings.earn })
    .from(economySettings)
    .where(and(eq(economySettings.enabled, true), inArray(economySettings.guildId, guildIds)));
  return rows.map((r) => ({ guildId: r.guildId, earn: readEconomy({ earn: r.earn }).earn }));
}
