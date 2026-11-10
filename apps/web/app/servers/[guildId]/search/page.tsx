import { cleanQuery, searchCases, searchMembers } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionBadge, plainMentions } from "@/components/format";
import { PageHead } from "@/components/PageHead";
import { getDb } from "@/lib/db";
import { searchIndex } from "@/lib/search-index";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const q = cleanQuery((await searchParams).q);
  const base = `/servers/${guild.id}`;
  const db = await getDb();
  const [places, members, cases] = q
    ? await Promise.all([
        Promise.resolve(searchIndex(q)),
        searchMembers(db, guild.id, q, 10),
        searchCases(db, guild.id, q, 10),
      ])
    : [[], [], []];
  const total = places.length + members.length + cases.length;

  return (
    <>
      <PageHead
        title={q ? `Results for “${q}”` : "Search"}
        description={`Pages, settings, members and cases in ${guild.name}.`}
      />
      {!q ? (
        <div className="g-card muted">
          Type a setting, a member's name or ID, or a case number like #12.
        </div>
      ) : total === 0 ? (
        <div className="g-card muted">Nothing matches. Try a shorter word or a case number.</div>
      ) : (
        <div className="grid-cards">
          {places.length ? (
            <section className="g-card card-col" aria-labelledby="hits-pages">
              <h2 className="card-title" id="hits-pages">
                Pages and settings
              </h2>
              {places.map((p) => (
                <Link key={`${p.path}-${p.title}`} className="search-hit" href={`${base}${p.path}`}>
                  <span>{p.title}</span>
                  <span className="g-help">{p.where}</span>
                </Link>
              ))}
            </section>
          ) : null}
          {members.length ? (
            <section className="g-card card-col" aria-labelledby="hits-members">
              <h2 className="card-title" id="hits-members">
                Members
              </h2>
              {members.map((m) => (
                <Link
                  key={m.userId}
                  className="search-hit"
                  href={`${base}/watch/member/${m.userId}`}
                >
                  <span>{m.name}</span>
                  <span className="g-help">
                    <span className="mono">{m.userId}</span> ·{" "}
                    {m.level === null ? "has cases" : `level ${m.level}`}
                  </span>
                </Link>
              ))}
            </section>
          ) : null}
          {cases.length ? (
            <section className="g-card card-col" aria-labelledby="hits-cases">
              <h2 className="card-title" id="hits-cases">
                Cases
              </h2>
              {cases.map((c) => (
                <Link key={c.id} className="search-hit" href={`${base}/watch?q=%23${c.caseNumber}`}>
                  <span>
                    <span className="mono">#{c.caseNumber}</span> <ActionBadge action={c.action} />{" "}
                    {c.targetTag ?? "—"}
                  </span>
                  <span className="g-help">
                    {c.reason ? plainMentions(c.reason) : "No reason given"}
                  </span>
                </Link>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
