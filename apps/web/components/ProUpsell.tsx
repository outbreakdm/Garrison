import Link from "next/link";
import type { ReactNode } from "react";
import { ProTag } from "@/components/cards/CardEditor";

/**
 * Where a Pro-only feature would sit on a Free server: the foil tag, one sentence on
 * what it does, and a link to the plans. The same shape everywhere, so a Pro feature is
 * never a mystery and never a hard sell.
 */
export function ProUpsell({ guildId, children }: { guildId: string; children: ReactNode }) {
  return (
    <div className="pro-slot">
      <ProTag on={false} />
      <span className="pro-slot__text">{children}</span>
      <PlansLink guildId={guildId} />
    </div>
  );
}

/** The one wording for "go and see what the paid plans add". */
export function PlansLink({ guildId, className }: { guildId: string; className?: string }) {
  return (
    <Link className={className ?? "pro-slot__link"} href={`/servers/${guildId}/plan#plans`}>
      See plans
    </Link>
  );
}
