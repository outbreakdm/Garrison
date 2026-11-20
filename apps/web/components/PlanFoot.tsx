"use client";

import type { AiTier } from "@garrison/db";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINES: Record<AiTier, { name: string; line: string; action: string }> = {
  free: {
    name: "Free plan",
    line: "Pro adds your own look, higher limits and 2,500 AI supplies a month.",
    action: "See Pro",
  },
  pro: { name: "Pro", line: "Everything unlocked on this server.", action: "Manage plan" },
  agency: {
    name: "Pro, from Agency",
    line: "One of your Agency seats covers this server.",
    action: "Manage plan",
  },
};

/**
 * The foot of the rail: this server's plan, and the way to change it. Its button is grey,
 * so the rail keeps one white thing (where you are); on the Plan page the card is marked
 * as the current page instead.
 */
export function PlanFoot({ guildId, tier }: { guildId: string; tier: AiTier }) {
  const t = LINES[tier];
  const href = `/servers/${guildId}/plan`;
  const here = usePathname() === href;
  return (
    <div className={`plan-foot plan-foot--${tier}${here ? " plan-foot--here" : ""}`}>
      <p className="plan-foot__name">{t.name}</p>
      <p className="plan-foot__line">{t.line}</p>
      <Link
        className="g-btn g-btn--secondary plan-foot__go"
        href={href}
        transitionTypes={["nav"]}
        aria-current={here ? "page" : undefined}
      >
        {here ? "You're on the Plan page" : t.action}
      </Link>
    </div>
  );
}
