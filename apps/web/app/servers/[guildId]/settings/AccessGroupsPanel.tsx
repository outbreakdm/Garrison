import {
  ACCESS_AREAS,
  ACCESS_SWITCHES,
  type AccessGroup,
  type AccessSwitch,
  FEATURES,
  type GuildPlan,
} from "@garrison/db";
import { ProTag } from "@/components/cards/CardEditor";
import type { GuildRole, MemberCard } from "@/lib/discord";
import { contentKey } from "@/lib/flash";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  removeGroupMember,
  saveGroup,
} from "./access-groups-actions";

/**
 * Access groups on Settings → Access: each group gives its people and roles None, View or Edit
 * on each dashboard area, and the sensitive switches a manager trusts it with. Managers only;
 * everyone else sees which groups exist and what they open.
 */
export function AccessGroupsPanel({
  guildId,
  manager,
  plan,
  groups,
  roles,
  found,
}: {
  guildId: string;
  manager: boolean;
  plan: GuildPlan;
  groups: AccessGroup[];
  roles: GuildRole[];
  /** People a manager found with the search above, to add to a group. */
  found: MemberCard[] | null;
}) {
  const limit = FEATURES["access.groups"][plan];
  const full = groups.length >= limit;
  const people = (found ?? []).filter((m) => !m.bot).slice(0, 8);
  const hidden = (groupId?: string) => (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      {groupId ? <input type="hidden" name="groupId" value={groupId} /> : null}
    </>
  );

  return (
    <section className="g-card card-col" id="groups" aria-labelledby="groups-title">
      <div className="card-head">
        <h2 className="card-title" id="groups-title">
          Access groups{" "}
          <span className="count">
            {groups.length} of {limit}
          </span>
        </h2>
      </div>
      <p className="g-help">
        Give mods and helpers just what they need: a group opens chosen pages for viewing or for
        changes, like "Giveaway hosts" with Edit on Giveaways and nothing else. Who has access,
        member pages, the public page and the plan always stay with Manage Server.
      </p>

      {manager ? (
        <form action={createGroup} className="roster-member__form">
          {hidden()}
          <label className="g-field">
            <span>New group</span>
            <input
              className="g-input"
              name="name"
              maxLength={32}
              required
              placeholder="Giveaway hosts"
            />
          </label>
          <span className="g-help">
            {plan === "free" ? (
              <>
                Free: {FEATURES["access.groups"].free} groups. <ProTag on={false} /> 15.
              </>
            ) : null}
          </span>
          <button type="submit" className="g-btn g-btn--primary" disabled={full}>
            {full ? `${limit} of ${limit} groups` : "Make group"}
          </button>
        </form>
      ) : null}

      {groups.map((g) => {
        const opens = Object.entries(g.areas)
          .map(
            ([a, l]) =>
              `${ACCESS_AREAS[a as keyof typeof ACCESS_AREAS]} (${l === "edit" ? "edit" : "view"})`,
          )
          .join(", ");
        return (
          <details
            className="g-card access-group"
            id={`group-${g.id}`}
            key={`${g.id}-${contentKey(g)}`}
          >
            <summary className="row-between">
              <span>
                <strong>{g.name}</strong>{" "}
                <span className="muted">
                  · {g.members.length} {g.members.length === 1 ? "member" : "members"} ·{" "}
                  {opens || "opens nothing yet"}
                </span>
              </span>
              <span className="g-help">{manager ? "Edit" : "View"}</span>
            </summary>

            <form action={saveGroup} className="card-col access-group__body">
              {hidden(g.id)}
              <label className="g-field">
                <span>Name</span>
                <input
                  className="g-input"
                  name="name"
                  maxLength={32}
                  required
                  defaultValue={g.name}
                  disabled={!manager}
                />
              </label>
              <fieldset className="access-areas">
                <legend className="g-label">What it can open</legend>
                {Object.entries(ACCESS_AREAS).map(([area, label]) => (
                  <label className="access-area" key={area}>
                    <span>{label}</span>
                    <select
                      className="g-input g-input--sm"
                      name={`area_${area}`}
                      defaultValue={g.areas[area as keyof typeof ACCESS_AREAS] ?? ""}
                      disabled={!manager}
                    >
                      <option value="">None</option>
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                  </label>
                ))}
              </fieldset>
              <fieldset className="card-col">
                <legend className="g-label">
                  Trusted with (Manage Server only, unless you tick them)
                </legend>
                {Object.entries(ACCESS_SWITCHES).map(([key, s]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      name={`switch_${key}`}
                      defaultChecked={g.switches.includes(key as AccessSwitch)}
                      disabled={!manager}
                    />
                    <span>
                      {s.label} <span className="muted">· {s.about}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {manager ? (
                <button type="submit" className="g-btn g-btn--primary">
                  Save {g.name}
                </button>
              ) : null}
            </form>

            <div className="card-col">
              <span className="g-label">People and roles</span>
              {g.members.length ? (
                <ul className="access-list">
                  {g.members.map((m) => (
                    <li className="access-row" key={`${m.kind}:${m.id}`}>
                      <span>
                        {m.kind === "role" ? `@${m.name}` : m.name || "A member"}
                        <span className="muted">
                          {" "}
                          · {m.kind === "role" ? "everyone with this role" : "person"}
                        </span>
                      </span>
                      {manager ? (
                        <form action={removeGroupMember}>
                          {hidden(g.id)}
                          <input type="hidden" name="kind" value={m.kind} />
                          <input type="hidden" name="id" value={m.id} />
                          <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="g-help">Nobody in this group yet.</p>
              )}
              {manager ? (
                <div className="act-row">
                  <form action={addGroupMember} className="act-row">
                    {hidden(g.id)}
                    <input type="hidden" name="kind" value="role" />
                    <select
                      className="g-input g-input--sm"
                      name="id"
                      required
                      defaultValue=""
                      aria-label={`Role to add to ${g.name}`}
                    >
                      <option value="" disabled>
                        Add a role
                      </option>
                      {roles
                        .filter((r) => !r.managed && r.id !== guildId)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            @{r.name}
                          </option>
                        ))}
                    </select>
                    <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                      Add role
                    </button>
                  </form>
                  {people.length ? (
                    <form action={addGroupMember} className="act-row">
                      {hidden(g.id)}
                      <input type="hidden" name="kind" value="user" />
                      <select
                        className="g-input g-input--sm"
                        name="id"
                        aria-label={`Person to add to ${g.name}`}
                      >
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                        Add person
                      </button>
                    </form>
                  ) : (
                    <span className="g-help">Find a person above to add them here.</span>
                  )}
                </div>
              ) : null}
              {manager ? (
                <form action={deleteGroup}>
                  {hidden(g.id)}
                  <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                    Delete {g.name}
                  </button>
                </form>
              ) : null}
            </div>
          </details>
        );
      })}
    </section>
  );
}
