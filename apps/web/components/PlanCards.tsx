import { formatPrice, PAID_PLANS_LIVE, type PlanTier, PRICING } from "@garrison/db";
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
 * this server stands. Prices come from PRICING; before PAID_PLANS_LIVE they read "at
 * launch" and nothing can be bought. `current` marks this server's plan; `action` goes
 * under a tier (an Agency owner's seat button, for example).
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
        const perServer =
          tier === "agency" && p.servers ? formatPrice(p.monthly / p.servers) : null;
        return (
          <li
            key={tier}
            className={`tier tier--${tier}${current === tier ? " is-current" : ""}`}
            aria-current={current === tier ? "true" : undefined}
          >
            <div className="tier__head">
              <h3 className="tier__name">
                {paid ? <span className="tier__foil">{p.name}</span> : p.name}
              </h3>
              {current === tier ? <span className="g-badge g-badge--go">This server</span> : null}
            </div>
            <p className="tier__price">
              {paid ? (
                <>
                  <span className="tier__amount">{formatPrice(p.monthly)}</span>
                  <span className="tier__per">
                    a month{p.servers === 1 ? ", per server" : `, up to ${p.servers} servers`}
                  </span>
                </>
              ) : (
                <>
                  <span className="tier__amount">Free</span>
                  <span className="tier__per">for any number of servers</span>
                </>
              )}
            </p>
            {paid ? (
              <p className="tier__year">
                or {formatPrice(p.yearly)} a year
                {perServer ? ` · ${perServer} a server a month` : ""}
                {PAID_PLANS_LIVE ? "" : " · at launch"}
              </p>
            ) : (
              <p className="tier__year">No card, no trial clock</p>
            )}
            <p className="tier__pitch">{p.pitch}</p>
            <ul className="tier__list">
              {p.highlights.map((h) => (
                <li key={h}>
                  <Check />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            {actions[tier] ? <div className="tier__action">{actions[tier]}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
