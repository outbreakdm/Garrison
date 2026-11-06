import {
  capacity,
  listActiveMembers,
  listOpenLfg,
  listSignups,
  listUpcomingOps,
} from "@garrison/db";
import type { Metadata } from "next";
import { formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Rally" };

/** Slot numbers 1..n, capped at 10 for the card. */
const slotNumbers = (n: number) => Array.from({ length: Math.min(n, 10) }, (_, i) => i + 1);

export default async function RallyPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = getDb();
  const [posts, raids] = await Promise.all([
    listOpenLfg(db, guild.id),
    listUpcomingOps(db, guild.id),
  ]);
  const [postMembers, raidSignups] = await Promise.all([
    Promise.all(posts.map((p) => listActiveMembers(db, p.id))),
    Promise.all(raids.map((r) => listSignups(db, r.id))),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Rally · LFG and events</span>
          <h1>Rally and Ops</h1>
          <p>Open groups and upcoming raids. Post with /lfg create and /raid create.</p>
        </div>
      </div>
      <div className="grid-cards">
        <section aria-label="Open groups" className="card-col">
          <div className="g-label">Open groups</div>
          {posts.length ? (
            posts.map((p, i) => {
              const members = postMembers[i] ?? [];
              const total = capacity(p.slots);
              return (
                <div className="g-lfg g-lfg--wide" key={p.id}>
                  <div className="g-lfg__head">
                    <span className="g-lfg__title">{p.title}</span>
                    <span
                      className={`g-badge ${p.status === "full" ? "g-badge--go" : "g-badge--accent"}`}
                    >
                      {p.status === "full"
                        ? "Full"
                        : total - members.length === 1
                          ? "1 left"
                          : "Open"}
                    </span>
                  </div>
                  <div className="g-lfg__meta">{p.note ?? formatTime(p.startsAt)}</div>
                  <div
                    className="g-slots"
                    role="img"
                    aria-label={`${members.length} of ${total} slots filled`}
                  >
                    {slotNumbers(total).map((n) => (
                      <span
                        key={n}
                        className={`g-slot ${n <= members.length ? "g-slot--filled" : ""}`}
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-card muted">No open groups.</div>
          )}
        </section>
        <section aria-label="Upcoming raids" className="card-col">
          <div className="g-label">Upcoming raids</div>
          {raids.length ? (
            raids.map((r, i) => {
              const signups = raidSignups[i] ?? [];
              const seated = signups.filter((s) => !s.bench);
              return (
                <div className="g-card g-card--hud card-col" key={r.id}>
                  <div>
                    <div className="g-label">
                      Ops · raid{r.repeatWeekly ? " · repeats weekly" : ""}
                    </div>
                    <h2>{r.title}</h2>
                    <div className="mono">{formatTime(r.startsAt, r.timezone)}</div>
                  </div>
                  {r.slots.map((s) => {
                    const n = seated.filter((x) => x.role === s.name).length;
                    return (
                      <div className="row-between" key={s.name}>
                        <span>{s.name}</span>
                        <span className="mono">
                          {n} / {s.count}
                        </span>
                      </div>
                    );
                  })}
                  <div className="mono">
                    {seated.length} / {capacity(r.slots)} · bench {signups.length - seated.length}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-card muted">No raids scheduled.</div>
          )}
        </section>
      </div>
    </>
  );
}
