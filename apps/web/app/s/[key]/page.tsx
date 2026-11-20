import {
  entitlements,
  getGuildLanguage,
  getGuildPlan,
  getLeaderboard,
  getPublicPage,
  LANGUAGES,
  publicBoardSize,
  say,
} from "@garrison/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { publicGuildLook } from "@/lib/discord";
import { env } from "@/lib/env";

/**
 * A server's public page (packages/db public-page.ts): no sign-in, only what its owner chose to
 * show. A page that's off, or a server Garrison left, is a plain 404, the same as one never made.
 */

const load = cache(async (key: string) => getPublicPage(await getDb(), key));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const page = await load((await params).key);
  if (!page) return { title: "Not found", robots: { index: false } };
  return {
    title: page.name,
    description: page.publicAbout ?? `${page.name} on Discord, with Garrison.`,
  };
}

export default async function PublicServerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const page = await load(key);
  if (!page) notFound();
  const db = await getDb();
  const [look, plan, lang] = await Promise.all([
    publicGuildLook(page.guildId),
    getGuildPlan(db, page.guildId),
    getGuildLanguage(db, page.guildId),
  ]);
  // Numbers and words in the server's language.
  const number = (n: number) => n.toLocaleString(LANGUAGES[lang].discord[0]);
  const [madeBefore = "", madeAfter = ""] = say(lang, "madeWith").split("{garrison}");
  const board = page.publicLeaderboard
    ? await getLeaderboard(db, page.guildId, publicBoardSize(entitlements(plan)))
    : [];
  const site = env().APP_URL.replace("://dash.", "://");

  return (
    <main className="shell" lang={lang}>
      <div className="main public-server">
        <header className="public-server__head">
          {look?.iconUrl ? (
            // biome-ignore lint/performance/noImgElement: Discord's CDN, sized by Discord
            <img className="public-server__icon" src={look.iconUrl} alt="" width={72} height={72} />
          ) : (
            <span className="public-server__icon public-server__icon--blank" aria-hidden="true">
              {page.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="public-server__title">
            <h1>{page.name}</h1>
            {look?.members ? (
              <p className="public-server__meta">
                {say(lang, "members", { count: number(look.members) })}
              </p>
            ) : null}
          </div>
          {page.publicInvite ? (
            <a
              className="g-btn g-btn--primary"
              href={`https://discord.gg/${page.publicInvite}`}
              rel="noopener nofollow"
            >
              {say(lang, "join")}
            </a>
          ) : null}
        </header>

        {page.publicAbout ? <p className="public-server__about">{page.publicAbout}</p> : null}

        {page.publicLeaderboard ? (
          <section className="g-card public-server__board" aria-labelledby="board-title">
            <h2 className="card-title" id="board-title">
              {say(lang, "leaderboard")}
            </h2>
            {board.length ? (
              <ol className="public-board">
                {board.map((m, i) => (
                  <li key={m.userId} className="public-board__row">
                    <span className="public-board__place">{i + 1}</span>
                    <span className="public-board__name">{m.username || say(lang, "aMember")}</span>
                    <span className="public-board__level">
                      {say(lang, "level", { level: m.level })}
                    </span>
                    <span className="public-board__xp">{number(m.xp)} XP</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="g-help">{say(lang, "noXp")}</p>
            )}
          </section>
        ) : null}

        <p className="g-help public-server__foot">
          {madeBefore}
          <a href={site} target="_blank" rel="noopener">
            Garrison
          </a>
          {madeAfter}
        </p>
      </div>
    </main>
  );
}
