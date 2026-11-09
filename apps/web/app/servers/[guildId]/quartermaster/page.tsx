import { listQmBuilds, type QmBuild } from "@garrison/db";
import type { Metadata } from "next";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";

export const metadata: Metadata = { title: "Quartermaster" };

const STATUS: Record<QmBuild["status"], string> = {
  pending: "g-badge--intel",
  applied: "g-badge--go",
  cancelled: "",
  expired: "",
  failed: "g-badge--alert",
  rolled_back: "g-badge--caution",
};

function opLine(op: QmBuild["plan"][number]) {
  switch (op.kind) {
    case "create_category":
      return `+ Category ${op.name}`;
    case "create_text_channel":
      return `+ #${op.name}${op.privateTo.length ? " · private" : ""}`;
    case "create_voice_channel":
      return `+ Voice ${op.name}`;
    default:
      return `+ Role @${op.name} · no permissions`;
  }
}

export default async function QuartermasterPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const { guild } = await requireGuildAccess(guildId);
  const builds = await listQmBuilds(await getDb(), guild.id, 25);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Builds</h1>
          <p>
            Describe channels and roles with /qm build in Discord, review the plan, then apply.
            Every build is versioned and can be undone here or with /qm undo.
          </p>
        </div>
      </div>
      <RequestsPanel guildId={guild.id} kinds={["undo_build"]} query={query} />
      {builds.length === 0 ? <div className="g-card muted">No builds yet.</div> : null}
      <div className="card-col">
        {builds.map((b) => (
          <div
            className={`g-card card-col ${b.status === "applied" ? "g-card--hud" : ""}`}
            key={b.id}
          >
            <div className="row-between">
              <h2>
                v{b.version} · {b.summary}
              </h2>
              <span className={`g-badge ${STATUS[b.status]}`}>{b.status.replace("_", " ")}</span>
            </div>
            {/* The request is user text; React escapes it. */}
            <p className="muted">
              “{b.prompt}” · {b.requestedByTag} ·{" "}
              {b.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
            <pre className="diff">{b.plan.map(opLine).join("\n")}</pre>
            {b.created.length ? <span className="mono">{b.created.length} created</span> : null}
            {b.error ? <span className="notice">{b.error}</span> : null}
            {b.status === "applied" || b.status === "failed" ? (
              <details className="confirm">
                <summary className="confirm__toggle g-btn g-btn--ghost">Undo v{b.version}…</summary>
                <form action={requestAction} className="card-col">
                  <input type="hidden" name="guildId" value={guild.id} />
                  <input type="hidden" name="page" value="quartermaster" />
                  <input type="hidden" name="kind" value="undo_build" />
                  <input type="hidden" name="version" value={b.version} />
                  <p className="g-help">
                    Deletes exactly the {b.created.length} channels and roles this build created,
                    and nothing else.
                  </p>
                  <button type="submit" className="g-btn g-btn--danger">
                    Yes, undo v{b.version}
                  </button>
                </form>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
