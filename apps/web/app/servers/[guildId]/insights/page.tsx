import { entitlements, getGuildPlan, getInsights, getInsightsShare } from "@garrison/db";
import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { INSIGHT_TABS, INSIGHT_WINDOWS, InsightsView } from "@/components/insights/InsightsView";
import { ProUpsell } from "@/components/ProUpsell";
import { getDb } from "@/lib/db";
import { channelNames } from "@/lib/discord";
import { env } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { makeShare, setShareEmbed, stopShare } from "./actions";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { guildId } = await params;
  const { guild, role } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const ent = entitlements(await getGuildPlan(db, guild.id));
  const maxDays = ent["insights.days"];
  const asked = Number(query.days);
  const days = INSIGHT_WINDOWS.find((w) => w === asked && w <= maxDays) ?? 30;
  const [data, names, share, flash] = await Promise.all([
    getInsights(db, guild.id, days),
    channelNames(guild.id).catch(() => new Map<string, string>()),
    getInsightsShare(db, guild.id),
    readFlash(),
  ]);
  const shareUrl = share ? `${env().APP_URL}/share/insights/${share.token}` : null;
  const base = `/servers/${guild.id}/insights`;
  const tab = INSIGHT_TABS.find((t) => t.key === query.tab)?.key ?? "overview";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>
            How the server is doing: messages, who's active, who joins and who stays. Counts only,
            never message content.
          </p>
        </div>
      </div>
      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      <InsightsView
        data={data}
        names={names}
        days={days}
        maxDays={maxDays}
        tab={tab}
        base={base}
        guildId={guild.id}
      />

      {ent["insights.export"] ? (
        <div className="row-between">
          <span className="g-help">
            One row per day for this range: messages, active members, joins, leaves.
          </span>
          <a className="g-btn g-btn--secondary" href={`${base}/export?days=${days}`} download>
            Download CSV
          </a>
        </div>
      ) : (
        <ProUpsell guildId={guild.id}>
          A year of insights instead of 30 days, and a spreadsheet of every day.
        </ProUpsell>
      )}

      <section className="g-card card-col share-panel" id="share" aria-labelledby="share-title">
        <div className="row-between">
          <h2 className="card-title" id="share-title">
            Share these insights
          </h2>
          {shareUrl ? <span className="g-badge g-badge--go">Shared</span> : null}
        </div>
        <p className="g-help">
          A read-only page with the counts and charts above, for your team or a sponsor: no member
          names, nothing they can change, and no way into the dashboard.
        </p>
        {role !== "manager" ? (
          <p className="g-help">Only someone with Manage Server can share Insights.</p>
        ) : shareUrl ? (
          <>
            <div className="share-panel__link">
              <input className="g-input mono" readOnly value={shareUrl} aria-label="Share link" />
              <CopyButton text={shareUrl} />
            </div>
            <form action={setShareEmbed} className="share-panel__embed">
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="embed" value={share?.embed ? "" : "on"} />
              <span>
                {share?.embed
                  ? "Other sites (Notion, a wiki) can show it inside their pages."
                  : "It only opens on its own: other sites can't show it inside their pages."}
              </span>
              <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                {share?.embed ? "Stop embedding" : "Allow embedding"}
              </button>
            </form>
            <div className="share-panel__actions">
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">
                  New link…
                </summary>
                <form action={makeShare}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                    Replace it: the old link stops working
                  </button>
                </form>
              </details>
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">
                  Stop sharing…
                </summary>
                <form action={stopShare}>
                  <input type="hidden" name="guildId" value={guild.id} />
                  <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                    Yes, stop sharing
                  </button>
                </form>
              </details>
            </div>
          </>
        ) : (
          <form action={makeShare}>
            <input type="hidden" name="guildId" value={guild.id} />
            <button type="submit" className="g-btn g-btn--secondary">
              Make a share link
            </button>
          </form>
        )}
      </section>
    </>
  );
}
