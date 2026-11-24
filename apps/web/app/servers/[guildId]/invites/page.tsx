import {
  entitlements,
  getGuildPlan,
  getInviteLabels,
  inviteCategories,
  inviteStats,
  PARTNERS,
} from "@garrison/db";
import type { Metadata } from "next";
import { HowItWorks } from "@/components/HowItWorks";
import { CompactLayout } from "@/components/PageLayouts";
import { SettingsNotice } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listInvites } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { undoChange } from "../settings/actions";
import { saveInviteLabels } from "./actions";
import { InvitesEditor, type Stat } from "./InvitesEditor";

export const metadata: Metadata = { title: "Invites" };

/** Joins counted over this many days. */
const DAYS = 30;

const pct = (s: { settled: number; stayed: number }) =>
  s.settled ? `${Math.round((s.stayed / s.settled) * 100)}%` : "–";

export default async function InvitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId, "invites");
  const query = await searchParams;
  const db = await getDb();
  const [labels, plan, invites, roles, stats, flash] = await Promise.all([
    getInviteLabels(db, guild.id),
    getGuildPlan(db, guild.id),
    listInvites(guild.id),
    listGuildRoles(guild.id).catch(() => []),
    inviteStats(db, guild.id, DAYS),
    readFlash(),
  ]);
  const byCode: Record<string, Stat> = Object.fromEntries(
    stats.map((s) => [s.code, { joins: s.joins, settled: s.settled, stayed: s.stayed }]),
  );
  const sum = (codes: string[]) =>
    codes.reduce(
      (t, c) => ({
        joins: t.joins + (byCode[c]?.joins ?? 0),
        settled: t.settled + (byCode[c]?.settled ?? 0),
        stayed: t.stayed + (byCode[c]?.stayed ?? 0),
      }),
      { joins: 0, settled: 0, stayed: 0 },
    );
  const categories = inviteCategories(labels).map((c) => ({
    name: c,
    ...sum(labels.filter((l) => l.category === c).map((l) => l.code)),
  }));
  const partners = labels.filter((l) => l.category === PARTNERS);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invites</h1>
          <p>Every invite to the server, who it brings and how many stay.</p>
          <HowItWorks>
            Name invites, sort them into categories, keep partner details beside their link, and
            give a role to everyone who joins with one.
          </HowItWorks>
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
      <SettingsNotice query={query} />

      <CompactLayout
        settings={
          <InvitesEditor
            guildId={guild.id}
            invites={
              invites?.map((i) => ({
                code: i.code,
                uses: i.uses,
                maxUses: i.maxUses,
                expiresAt: i.expiresAt?.toISOString() ?? null,
                inviter: i.inviter,
                channel: i.channel,
                vanity: i.vanity,
              })) ?? null
            }
            labels={labels}
            stats={byCode}
            roles={roles
              .filter((r) => !r.managed && !isDangerousRole(r.permissions))
              .map((r) => ({ id: r.id, name: r.name }))}
            limit={entitlements(plan)["invites.labels"]}
            days={DAYS}
            action={saveInviteLabels}
            undo={undoChange}
            stamp={contentKey(labels)}
          />
        }
        live={
          categories.length || partners.length ? (
            <>
              {categories.length ? (
                <section className="g-card table-card" aria-labelledby="by-category">
                  <div className="table-card__head">
                    <h2 className="card-title" id="by-category">
                      By category <span className="muted">last {DAYS} days</span>
                    </h2>
                  </div>
                  <ul className="category-sums">
                    {categories.map((c) => (
                      <li key={c.name}>
                        <span className="category-sums__name">{c.name}</span>
                        <span>
                          <strong>{c.joins}</strong> joined
                        </span>
                        <span>
                          <strong>{pct(c)}</strong> stayed a week
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {partners.length ? (
                <section
                  className="g-card table-card"
                  id="partners"
                  aria-labelledby="partners-title"
                >
                  <div className="table-card__head">
                    <h2 className="card-title" id="partners-title">
                      Partners <span className="count">{partners.length}</span>
                    </h2>
                  </div>
                  <ul className="partner-list">
                    {partners.map((p) => {
                      const s = byCode[p.code] ?? { joins: 0, settled: 0, stayed: 0 };
                      return (
                        <li key={p.code}>
                          <div className="partner-list__head">
                            <strong>{p.partner?.server ?? p.name}</strong>
                            <span className="mono muted">{p.code}</span>
                          </div>
                          <div className="partner-list__stats">
                            <span>
                              <strong>{s.joins}</strong> joined
                            </span>
                            <span>
                              <strong>{pct(s)}</strong> stayed a week
                            </span>
                            {p.partner?.contact ? <span>Contact: {p.partner.contact}</span> : null}
                          </div>
                          {p.partner?.note ? (
                            <p className="partner-list__note">{p.partner.note}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          ) : undefined
        }
      />
    </>
  );
}
