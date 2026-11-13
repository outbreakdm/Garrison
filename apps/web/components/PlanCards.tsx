import { formatPrice, PAID_PLANS_LIVE, type PlanTier, PRICING, yearlySaving } from "@garrison/db";
import type { ReactNode } from "react";

const TIERS: PlanTier[] = ["free", "pro", "agency"];

function Check() {
  return (
    <svg className="tier__check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Free, Pro and Agency side by side: the price, who it's for, what it adds, and where
 * this server stands. Prices come from PRICING. Before PAID_PLANS_LIVE the section says
 * once that these are launch prices, and each paid card ends with "Opens at launch".
 * `current` marks this server's plan; `actions` goes at the foot of a tier.
 */
export function PlanCards({
  current,
  actions = {},
}: {
  current?: PlanTier;
  actions?: Partial<Record<PlanTier, ReactNode>>;
}) {
  return (
    <ul className="tiers">
      {TIERS.map((tier) => {
        const p = PRICING[tier];
        const paid = p.monthly > 0;
        const here = current === tier;
        const foot =
          actions[tier] ??
          (here ? null : paid && !PAID_PLANS_LIVE ? (
            <span className="tier__soon">Opens at launch</span>
          ) : null);
        return (
          <li
            key={tier}
            className={`tier tier--${tier}${here ? " is-current" : ""}`}
            aria-current={here ? "true" : undefined}
          >
            <div className="tier__head">
              <h3 className="tier__name">
                {paid ? <span className="tier__foil">{p.name}</span> : p.name}
              </h3>
              {here ? <span className="g-badge g-badge--accent">This server</span> : null}
            </div>
            <p className="tier__price">
              <span className="tier__amount">{paid ? formatPrice(p.monthly) : "$0"}</span>
              <span className="tier__per">
                {!paid
                  ? "for any number of servers"
                  : p.servers === 1
                    ? "a month, per server"
                    : `a month, up to ${p.servers} servers`}
              </span>
            </p>
            <p className="tier__year">
              {paid
                ? `or ${formatPrice(p.yearly)} a year, ${yearlySaving(p.monthly, p.yearly)}`
                : "No card, no trial clock"}
            </p>
            <p className="tier__pitch">{p.pitch}</p>
            <ul className="tier__list">
              {p.highlights.map((h) => (
                <li key={h}>
                  <Check />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            {foot ? <div className="tier__action">{foot}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
