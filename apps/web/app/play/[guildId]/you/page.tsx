import {
  entitlements,
  getGuildPlan,
  getLeaderboard,
  getMemberRank,
  getRankDetails,
  getRanksSettings,
  getSharedLinks,
  levelForXp,
  rankCardForPlan,
  rankDetailLines,
  readRankCard,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { memberSpace } from "@/lib/member";
import { MemberCardForm } from "./MemberCardForm";

export const metadata: Metadata = { title: "You" };

/**
 * A member's own level, place and rank card in a server, with the details the card asks for,
 * and the leaderboard. Only their own: nothing here reads or changes anyone else.
 */
export default async function YouPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { session, guild, show } = await memberSpace(guildId);
  const base = `/play/${guild.id}`;
  if (!show.you)
    return (
      <div className="member__page">
        <div className="page-head">
          <div>
            <h1>You</h1>
            <p>
              This server doesn't show levels here. <Link href={base}>Groups and raids</Link> are
              open to you.
            </p>
          </div>
        </div>
      </div>
    );

  const db = await getDb();
  const [settings, plan, rank, answers, links, board, flash] = await Promise.all([
    getRanksSettings(db, guild.id),
    getGuildPlan(db, guild.id),
    getMemberRank(db, guild.id, session.userId),
    getRankDetails(db, guild.id, session.userId),
    getSharedLinks(db, guild.id, session.userId).catch(() => []),
    getLeaderboard(db, guild.id, 10),
    readFlash(),
  ]);
  const style = rankCardForPlan(readRankCard(settings.card), entitlements(plan));
  const xp = rank?.xp ?? 0;
  const lv = levelForXp(xp);
  const numbers = {
    position: rank ? rank.position : null,
    level: lv.level,
    total: xp,
    into: lv.intoLevel,
    needed: lv.needed,
  };
  // Fields the card reads from shared game accounts, as the card shows them now.
  const fromAccounts = Object.fromEntries(
    style.fields
      .filter((f) => f.from)
      .flatMap((f) => {
        const [line] = rankDetailLines([f], {}, links);
        return line ? [[f.id, line.value]] : [];
      }),
  );
  const linked = links.map((l) => l.displayName).filter(Boolean);
  const onBoard = board.some((r) => r.userId === session.userId);

  return (
    <div className="member__page">
      <div className="page-head">
        <div>
          <h1>You</h1>
          <p>
            {rank
              ? `Level ${lv.level}, ${xp.toLocaleString("en-US")} XP, number ${rank.position} in this server.`
              : "No XP here yet. Talking in the server earns it, once a minute at most."}
          </p>
        </div>
      </div>
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

      <section className="g-card card-col" aria-labelledby="card-title">
        <h2 className="card-title" id="card-title">
          Your rank card
        </h2>
        <MemberCardForm
          guildId={guild.id}
          style={style}
          name={session.username}
          numbers={numbers}
          answers={answers}
          fromAccounts={fromAccounts}
          linked={linked}
        />
        {style.fields.some((f) => f.from) || style.showLinked ? (
          <p className="g-help">
            Details from game accounts come from the ones you share with this server.{" "}
            <Link href="/account">Change them on Account</Link>.
          </p>
        ) : null}
      </section>

      <section className="g-card table-card" aria-labelledby="board-title">
        <div className="table-card__head">
          <h2 className="card-title" id="board-title">
            Most XP <span className="count">{board.length}</span>
          </h2>
        </div>
        {board.length ? (
          <ol className="member-board">
            {board.map((r, i) => {
              const l = levelForXp(r.xp);
              const me = r.userId === session.userId;
              return (
                <li key={r.userId} className={me ? "member-board__row is-me" : "member-board__row"}>
                  <span className="member-board__n">{i + 1}</span>
                  <span className="member-board__name">
                    {me ? "You" : r.username || `Member ${r.userId.slice(-4)}`}
                  </span>
                  <span className="member-board__lv">Level {l.level}</span>
                  <span className="member-board__xp">{r.xp.toLocaleString("en-US")} XP</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="feed__empty">Nobody has XP here yet.</p>
        )}
        {rank && !onBoard ? (
          <p className="g-help member-board__you">
            You're number {rank.position}, with {xp.toLocaleString("en-US")} XP.
          </p>
        ) : null}
      </section>
    </div>
  );
}
