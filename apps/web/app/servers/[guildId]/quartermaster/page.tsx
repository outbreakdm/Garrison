import { listQmBuilds, type QmBuild } from "@garrison/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

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
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const builds = await listQmBuilds(getDb(), guild.id, 25);
  return (
    <>
      <div className="page-head">
        <div>
          <span className="g-label">Quartermaster · AI builder</span>
          <h1>Builds</h1>
          <p>
            Describe channels and roles with /qm build in Discord, review the plan, then apply.
            Every build is versioned and can be undone with /qm undo.
          </p>
        </div>
      </div>
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
          </div>
        ))}
      </div>
    </>
  );
}
