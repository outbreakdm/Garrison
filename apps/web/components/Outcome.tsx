import { ACTION_STATUS } from "@/lib/rally-schema";

/**
 * The result of your last request from this control, or why it wasn't sent,
 * shown right beside it. The page's Requests panel refreshes the page while a
 * request is waiting, so this updates by itself: put the kinds a control sends
 * in that page's panel too.
 */
export function Outcome({
  action,
  error,
}: {
  action: { status: string; message: string | null } | null;
  error?: string;
}) {
  if (error)
    return (
      <p className="outcome outcome--alert" role="alert">
        {error}
      </p>
    );
  if (!action) return null;
  const st = ACTION_STATUS[action.status] ?? { label: action.status, tone: "g-badge" };
  const working = action.status === "pending" || action.status === "running";
  const tone = working ? "" : action.status === "done" ? "outcome--ok" : "outcome--alert";
  return (
    <p className={`outcome ${tone}`} role="status">
      <span className={st.tone}>{st.label}</span>
      <span>{working ? "Garrison is on it. This updates by itself." : action.message}</span>
    </p>
  );
}
