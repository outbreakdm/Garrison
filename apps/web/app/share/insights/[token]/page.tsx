import {
  entitlements,
  findInsightsShare,
  getActiveGuild,
  getGuildPlan,
  getInsights,
} from "@garrison/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { INSIGHT_TABS, INSIGHT_WINDOWS, InsightsView } from "@/components/insights/InsightsView";
import { getDb } from "@/lib/db";
import { channelNames } from "@/lib/discord";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Insights",
  // A shared link is for whoever holds it, never for search engines.
  robots: { index: false, follow: false },
};

/**
 * A server's Insights, shared read-only by a manager: counts and charts, no member names,
 * no sign-in, nothing that leads into the dashboard. Inside another site's frame it shows only
 * when the manager allowed embedding (browsers say when a page is loading in a frame).
 */
export default async function SharedInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const db = await getDb();
  const share = await findInsightsShare(db, token);
  if (!share) notFound();
  const guild = await getActiveGuild(db, share.guildId);
  if (!guild) notFound();
  const framed = (await headers()).get("sec-fetch-dest") === "iframe";
  if (framed && !share.embed)
    return (
      <main className="shell">
        <div className="main shared-insights">
          <p className="notice" role="status">
            This link opens on its own page only. Open it in a new tab to see it.
          </p>
        </div>
      </main>
    );
  const maxDays = entitlements(await getGuildPlan(db, guild.id))["insights.days"];
  const asked = Number(query.days);
  const days = INSIGHT_WINDOWS.find((w) => w === asked && w <= maxDays) ?? 30;
  const tab = INSIGHT_TABS.find((t) => t.key === query.tab)?.key ?? "overview";
  const [data, names] = await Promise.all([
    getInsights(db, guild.id, days),
    channelNames(guild.id).catch(() => new Map<string, string>()),
  ]);
  const site = env().APP_URL.replace("://dash.", "://");

  return (
    <main className="shell">
      <div className="main shared-insights">
        <div className="page-head">
          <div>
            <p className="shared-insights__kicker">Shared insights</p>
            <h1>{guild.name}</h1>
            <p>
              Messages, active members, joins and who stays, shared by the server's managers. Counts
              only: never names or message content.
            </p>
          </div>
        </div>
        <InsightsView
          data={data}
          names={names}
          days={days}
          maxDays={maxDays}
          tab={tab}
          base={`/share/insights/${token}`}
          guildId={guild.id}
          shared
        />
        <p className="g-help shared-insights__foot">
          Counted by{" "}
          <a href={site} target="_blank" rel="noopener">
            Garrison
          </a>
          , the server's bot. Days are in UTC.
        </p>
      </div>
    </main>
  );
}
