import type { ReactNode } from "react";
import {
  afterRows,
  detailId,
  type PermRow,
  type PreviewChannel,
  type PreviewRole,
  type ServerPreview,
} from "@/lib/qm-preview";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const plural = (n: number, one: string) => `${n} ${one}`;

function Dot({ color }: { color: number }) {
  return (
    <svg className="qm-detail__dot" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      {/* A fill attribute, not a style: the page's CSP allows no inline styles. */}
      {color ? (
        <circle cx="5" cy="5" r="5" fill={hex(color)} />
      ) : (
        <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** One role's overwrite on a channel: the counts at a glance, the names when opened. */
function Perm({ p }: { p: PermRow }) {
  return (
    <details className="qm-perm">
      <summary>
        <span className="qm-perm__cue" aria-hidden="true" />
        <Dot color={p.color} />
        <span className="qm-perm__who">{p.who}</span>
        <span className="qm-perm__counts">
          {p.allowed.length ? (
            <span className="qm-pill qm-pill--go">{plural(p.allowed.length, "allowed")}</span>
          ) : null}
          {p.denied.length ? (
            <span className="qm-pill qm-pill--alert">{plural(p.denied.length, "denied")}</span>
          ) : null}
          {!p.allowed.length && !p.denied.length ? (
            <span className="qm-pill">No change</span>
          ) : null}
        </span>
      </summary>
      <dl className="qm-perm__body">
        {p.allowed.length ? (
          <div>
            <dt>Allowed</dt>
            <dd>{p.allowed.join(", ")}</dd>
          </div>
        ) : null}
        {p.denied.length ? (
          <div>
            <dt>Denied</dt>
            <dd>{p.denied.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function Shell({
  id,
  title,
  children,
  remove,
}: {
  id: string;
  title: string;
  children: ReactNode;
  remove: ReactNode;
}) {
  return (
    <section className="qm-detail" id={id} aria-label={title}>
      <header className="qm-detail__head">
        <span className="qm-detail__title">{title}</span>
        <a className="qm-detail__close" href="#qm-plan">
          <span className="sr-only">Back to the plan</span>
        </a>
      </header>
      <div className="qm-detail__body">{children}</div>
      {remove ? <div className="qm-detail__foot">{remove}</div> : null}
    </section>
  );
}

function ChannelDetail({ c, remove }: { c: PreviewChannel; remove: ReactNode }) {
  const perms = c.perms ?? [];
  return (
    <Shell id={detailId(c.key)} title="Channel details" remove={c.isNew ? remove : null}>
      <div className="qm-detail__id">
        <span className="qm-detail__tile" aria-hidden="true">
          {c.kind === "voice" ? (
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M2.5 6v4h2.6L8.5 13V3L5.1 6H2.5Z" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M11 5.5a3.5 3.5 0 0 1 0 5" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            "#"
          )}
        </span>
        <span>
          <span className="qm-detail__name">
            {c.name}
            {c.isNew ? <span className="sp-new">New</span> : null}
          </span>
          <span className="qm-detail__kind">
            {c.kind === "voice" ? "Voice channel" : "Text channel"}
            {c.locked ? " · private" : ""}
          </span>
        </span>
      </div>
      {c.topic ? (
        <div className="qm-detail__block">
          <h3 className="g-label">Topic</h3>
          <p>{c.topic}</p>
        </div>
      ) : null}
      {c.isNew && c.details.length ? (
        <div className="qm-detail__block">
          <h3 className="g-label">Set up</h3>
          <p>{c.details.filter((d) => d !== c.topic).join(" · ") || "Open to everyone"}</p>
        </div>
      ) : null}
      <div className="qm-detail__block">
        <h3 className="g-label">Permissions</h3>
        {perms.length ? (
          <div className="qm-perms">
            {perms.map((p) => (
              <Perm p={p} key={p.key} />
            ))}
          </div>
        ) : (
          <p className="muted">
            No channel overrides: every role uses its server-wide permissions here.
          </p>
        )}
      </div>
    </Shell>
  );
}

function RoleDetail({ r, remove }: { r: PreviewRole; remove: ReactNode }) {
  return (
    <Shell id={detailId(r.key)} title="Role details" remove={r.isNew ? remove : null}>
      <div className="qm-detail__id">
        <svg
          className="qm-detail__swatch"
          viewBox="0 0 40 40"
          width="40"
          height="40"
          aria-hidden="true"
        >
          <circle cx="20" cy="20" r="20" fill={r.color ? hex(r.color) : "currentColor"} />
        </svg>
        <span>
          <span className="qm-detail__name">
            {r.name}
            {r.isNew ? <span className="sp-new">New</span> : null}
          </span>
          <span className="qm-detail__kind">
            {r.position ? `Position #${r.position}` : "Goes to the bottom of the role list"}
          </span>
        </span>
      </div>
      <div className="qm-detail__facts">
        <div>
          <h3 className="g-label">Color</h3>
          <p className="qm-detail__mono">{r.color ? hex(r.color) : "Default"}</p>
        </div>
        <div>
          <h3 className="g-label">Power</h3>
          <p>
            <span
              className={`qm-pill ${r.power === "Admin" ? "qm-pill--alert" : r.power === "Moderator" ? "qm-pill--caution" : ""}`}
            >
              {r.power ?? "Member"}
            </span>
          </p>
        </div>
      </div>
      <div className="qm-detail__block">
        <h3 className="g-label">Permissions</h3>
        <p>{r.perms?.length ? r.perms.join(", ") : "Default member permissions"}</p>
        <p className="g-help">
          Who can see or post in a particular channel is shown on that channel.
        </p>
      </div>
      {r.details.length ? <p className="g-help">{r.details.join(" · ")}</p> : null}
    </Shell>
  );
}

/**
 * Every channel and role in the plan panel, each a section the panel shows when its row is
 * picked (#qm-d-…). Works without scripts: the rows are links, the sections are :target.
 * `remove(ref)` is the form that takes a new item out of the draft.
 */
export function PlanDetails({
  preview,
  remove,
}: {
  preview: ServerPreview;
  remove: (ref: string) => ReactNode;
}) {
  // A moved row's old place is only drawn in the preview's Now view; it has no details.
  const channels = [
    ...preview.loose,
    ...afterRows(preview.categories).flatMap((c) => afterRows(c.channels)),
  ];
  return (
    <>
      {channels.map((c) => (
        <ChannelDetail c={c} key={c.key} remove={c.ref ? remove(c.ref) : null} />
      ))}
      {afterRows(preview.roles).map((r) => (
        <RoleDetail r={r} key={r.key} remove={r.ref ? remove(r.ref) : null} />
      ))}
    </>
  );
}
