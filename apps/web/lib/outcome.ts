/**
 * The result of a request, shown beside the control that sent it rather than
 * only in the Requests panel. Pure, so it's unit tested.
 */

/** Results stay beside their control this long; the Requests panel keeps them after. */
export const OUTCOME_WINDOW_MS = 10 * 60_000;

/** An element ID a form may ask to come back to: lowercase, digits and dashes. */
export const ANCHOR = /^[a-z][a-z0-9-]{0,63}$/;

/** Why a request wasn't queued, by the code the server action redirects with. */
export const REQUEST_ERRORS: Record<string, string> = {
  invalid: "Some values weren't valid. Nothing was queued.",
  not_found: "That has changed since the page loaded. Refresh and try again.",
  channel: "Pick a text channel from this server.",
  owner_only: "Only the server owner can change anti-nuke.",
  busy: "Garrison has 10 requests waiting for this server. Try again shortly.",
  too_fast: "That's a lot of requests at once. Wait a minute and try again.",
  // Calls for signups are the only requests with a cooldown.
  cooldown: "A call for signups for this raid went out in the last hour. Try again later.",
  self: "You can't moderate yourself.",
  qm_request: "Describe what to build, in 500 characters or fewer.",
  qm_not_yours: "Only the person who asked for a plan can apply it. You can discard it.",
};

type Query = Record<string, string | string[] | undefined>;

/** The error for the control with this ID, when the last request from it wasn't queued. */
export function errorAt(query: Query, id: string) {
  return query.at === id && typeof query.error === "string"
    ? (REQUEST_ERRORS[query.error] ?? REQUEST_ERRORS.invalid)
    : undefined;
}

interface Action {
  kind: string;
  status: string;
  requestedById: string;
  createdAt: Date;
  payload: unknown;
}

/** A field of a request's payload, when it's a string or a number. */
export function payloadField(payload: unknown, key: string): string | null {
  const v =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : null;
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

/**
 * Your newest request of one of `kinds` that `match` accepts, from the last
 * few minutes. `actions` is newest first, as listDashboardActions returns it.
 */
export function latestOutcome<A extends Action>(
  actions: A[],
  opts: { userId: string; kinds: string[]; match?: (payload: unknown) => boolean; now?: Date },
): A | null {
  const now = (opts.now ?? new Date()).getTime();
  return (
    actions.find(
      (a) =>
        a.requestedById === opts.userId &&
        opts.kinds.includes(a.kind) &&
        now - a.createdAt.getTime() < OUTCOME_WINDOW_MS &&
        (opts.match ? opts.match(a.payload) : true),
    ) ?? null
  );
}
