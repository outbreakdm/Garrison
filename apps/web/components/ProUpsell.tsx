import Link from "next/link";
import { ProTag } from "@/components/cards/CardEditor";

/**
 * Where a Pro-only feature would sit on a Free server: the foil tag, one sentence on
 * what it does, and a link that opens the Pro sheet with that sentence. The same shape
 * everywhere, so a Pro feature is never a mystery and never a hard sell.
 */
export function ProUpsell({ guildId, children }: { guildId: string; children: string }) {
  return (
    <div className="pro-slot">
      <ProTag on={false} />
      <span className="pro-slot__text">{children}</span>
      <PlansLink guildId={guildId} about={children} />
    </div>
  );
}

/**
 * The one wording for "see what the paid plans add". Opens the Pro sheet (with `about` as
 * its sentence); goes to the Plan page before scripts load or in a new tab.
 */
export function PlansLink({
  guildId,
  className,
  about = "",
}: {
  guildId: string;
  className?: string;
  about?: string;
}) {
  return (
    <Link
      className={className ?? "pro-slot__link"}
      href={`/servers/${guildId}/plan#plans`}
      data-pro={about}
    >
      See what Pro adds
    </Link>
  );
}
