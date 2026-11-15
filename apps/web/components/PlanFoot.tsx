import type { AiTier } from "@garrison/db";
import Link from "next/link";

const LINES: Record<AiTier, { name: string; line: string; action: string }> = {
  free: {
    name: "Free plan",
    line: "Pro adds your own look, higher limits and 3,000 AI supplies a month.",
    action: "See Pro",
  },
  pro: { name: "Pro", line: "Everything unlocked on this server.", action: "Manage plan" },
  agency: {
    name: "Pro, from Agency",
    line: "One of your Agency seats covers this server.",
    action: "Manage plan",
  },
};

/** The foot of the rail: this server's plan, and the way to change it. */
export function PlanFoot({ guildId, tier }: { guildId: string; tier: AiTier }) {
  const t = LINES[tier];
  return (
    <div className={`plan-foot plan-foot--${tier}`}>
      <p className="plan-foot__name">{t.name}</p>
      <p className="plan-foot__line">{t.line}</p>
      <Link
        className={`g-btn ${tier === "free" ? "g-btn--primary" : "g-btn--secondary"} plan-foot__go`}
        href={`/servers/${guildId}/plan`}
        transitionTypes={["nav"]}
      >
        {t.action}
      </Link>
    </div>
  );
}
