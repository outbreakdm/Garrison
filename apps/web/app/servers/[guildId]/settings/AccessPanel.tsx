import type { AccessGrant, DashboardRole } from "@garrison/db";
import { HowItWorks } from "@/components/HowItWorks";
import { MemberAvatar } from "@/components/MemberAvatar";
import { formAction } from "@/lib/autosave";
import type { GuildRole, MemberCard } from "@/lib/discord";
import { changeAccess } from "./access-actions";

const LEVELS = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
] as const;

/**
 * Dashboard access, on Settings: who else may use this dashboard and how. Managers change it;
 * everyone else sees the list (the forms are marked for managers, so they rest for others).
 */
export function AccessPanel({
  guildId,
  role,
  grants,
  roles,
  query,
  found,
}: {
  guildId: string;
  role: DashboardRole;
  grants: AccessGrant[];
  roles: GuildRole[];
  /** What a manager searched for, to add a person. */
  query: string;
  /** Members matching it; null when Discord didn't answer. */
  found: MemberCard[] | null;
}) {
  const manager = role === "manager";
  const listed = new Set(grants.map((g) => `${g.kind}:${g.id}`));
  const addable = roles.filter(
    (r) => !r.managed && r.id !== guildId && !listed.has(`role:${r.id}`),
  );
  const hidden = (op: string, kind: string, id: string) => (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
    </>
  );
  const action = formAction(changeAccess);

  return (
    <section className="g-card card-col" id="access" aria-labelledby="access-title">
      <div className="card-head">
        <h2 className="card-title" id="access-title">
          Dashboard access <span className="count">{grants.length}</span>
        </h2>
      </div>
      <p className="g-help">
        Anyone with Manage Server already runs this dashboard. Give others a way in as a{" "}
        <strong>Viewer</strong> or an <strong>Editor</strong>.
      </p>
      <HowItWorks>
        Viewers see every page, logs, cases and tickets included, and change nothing. Editors change
        settings and post, including which roles Garrison hands out. Moderation, backups, the plan
        and this list stay with Manage Server. Leaving the server, or losing the role, ends their
        access at once.
      </HowItWorks>

      {grants.length ? (
        <ul className="access-list">
          {grants.map((g) => (
            <li className="access-row" key={`${g.kind}:${g.id}`}>
              <span className="access-row__who">
                {g.kind === "role" ? (
                  <span className="access-row__role" aria-hidden="true">
                    @
                  </span>
                ) : (
                  <MemberAvatar name={g.name || "Member"} src={null} />
                )}
                <span>
                  {g.kind === "role" ? `@${g.name}` : g.name || "A member"}
                  <span className="muted">
                    {" "}
                    · {g.kind === "role" ? "everyone with this role" : "person"}
                  </span>
                </span>
              </span>
              <form action={action} className="access-row__level" data-need="manager">
                {hidden("level", g.kind, g.id)}
                <fieldset className="seg seg--inline">
                  <legend className="sr-only">Access for {g.name}</legend>
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="submit"
                      name="level"
                      value={l.value}
                      className="seg__button"
                      aria-pressed={g.level === l.value}
                      disabled={g.level === l.value}
                    >
                      {l.label}
                    </button>
                  ))}
                </fieldset>
              </form>
              <form action={action} data-need="manager">
                {hidden("remove", g.kind, g.id)}
                <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="feed__empty">Nobody else yet. Only people with Manage Server can open it.</p>
      )}

      {manager ? (
        <div className="access-add">
          <form action={action} className="access-add__row" data-need="manager">
            <input type="hidden" name="guildId" value={guildId} />
            <input type="hidden" name="op" value="add" />
            <input type="hidden" name="kind" value="role" />
            <label className="g-field" htmlFor="access-role">
              <span>Give a role access</span>
              <select className="g-input" id="access-role" name="id" required defaultValue="">
                <option value="" disabled>
                  Pick a role
                </option>
                {addable.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="access-add__buttons">
              <button type="submit" name="level" value="viewer" className="g-btn g-btn--secondary">
                As viewers
              </button>
              <button type="submit" name="level" value="editor" className="g-btn g-btn--secondary">
                As editors
              </button>
            </span>
          </form>

          <search>
            <form method="get" action="#access" className="access-add__row">
              <label className="g-field" htmlFor="access-q">
                <span>Give a person access</span>
                <input
                  className="g-input"
                  id="access-q"
                  name="access_q"
                  type="search"
                  maxLength={32}
                  defaultValue={query}
                  placeholder="Name or user ID"
                />
              </label>
              <span className="access-add__buttons">
                <button type="submit" className="g-btn g-btn--secondary">
                  Find
                </button>
              </span>
            </form>
          </search>
          {query ? (
            found === null ? (
              <p className="notice" role="alert">
                Discord didn't answer. Try again in a moment.
              </p>
            ) : found.length ? (
              <ul className="access-list">
                {found.map((m) => (
                  <li className="access-row" key={m.id}>
                    <span className="access-row__who">
                      <MemberAvatar name={m.name} src={m.avatar} />
                      <span>
                        {m.name}
                        <span className="muted"> · {m.username}</span>
                      </span>
                    </span>
                    {listed.has(`user:${m.id}`) ? (
                      <span className="g-badge">Already listed</span>
                    ) : m.bot || !m.joinedAt ? (
                      <span className="muted">{m.bot ? "A bot" : "Not in the server"}</span>
                    ) : (
                      <form action={action} className="access-row__level" data-need="manager">
                        {hidden("add", "user", m.id)}
                        <span className="access-add__buttons">
                          <button
                            type="submit"
                            name="level"
                            value="viewer"
                            className="g-btn g-btn--secondary g-btn--sm"
                          >
                            Viewer
                          </button>
                          <button
                            type="submit"
                            name="level"
                            value="editor"
                            className="g-btn g-btn--secondary g-btn--sm"
                          >
                            Editor
                          </button>
                        </span>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nobody here matches “{query}”. Try their user ID.</p>
            )
          ) : null}
        </div>
      ) : (
        <p className="g-help">Only someone with Manage Server can change this list.</p>
      )}
    </section>
  );
}
