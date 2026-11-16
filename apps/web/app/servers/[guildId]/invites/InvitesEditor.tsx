"use client";

import {
  INVITE_LIMITS,
  type InviteLabel,
  inviteCategories,
  inviteCode,
  PARTNERS,
  SUGGESTED_CATEGORIES,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

export interface InviteRow {
  code: string;
  uses: number;
  maxUses: number;
  /** ISO, or null for never. */
  expiresAt: string | null;
  inviter: string | null;
  channel: string | null;
  vanity: boolean;
}

export interface Stat {
  joins: number;
  settled: number;
  stayed: number;
}

interface Props {
  guildId: string;
  invites: InviteRow[] | null;
  labels: InviteLabel[];
  stats: Record<string, Stat>;
  roles: { id: string; name: string }[];
  limit: number;
  days: number;
  action: Action;
  undo: Action;
  stamp: string;
}

const pct = (s: Stat | undefined) =>
  s?.settled ? `${Math.round((s.stayed / s.settled) * 100)}%` : "–";

/** Sets a CSS color on the element from script (the dashboard's CSP has no inline styles). */
const tint = (color: string | null) => (el: HTMLElement | null) => {
  if (!el) return;
  if (color) el.style.setProperty("--invite", color);
  else el.style.removeProperty("--invite");
};

/** The invites as a panel that saves itself: labels, categories, partners, join roles. */
export function InvitesEditor(props: Props) {
  return (
    <AutoSaveCard
      id="labels"
      title="Your invites"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save invite labels"
    >
      <InviteFields {...props} />
    </AutoSaveCard>
  );
}

function InviteFields({ invites, labels: saved, stats, roles, limit, days }: Props) {
  const [labels, setLabels] = useState<InviteLabel[]>(saved);
  const [filter, setFilter] = useState<string>("all");
  const [paste, setPaste] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(labels));
  const byCode = new Map(labels.map((l) => [l.code, l]));
  const categories = inviteCategories(labels);
  const suggestions = [...new Set([...SUGGESTED_CATEGORIES, ...categories])];
  const listed = invites ?? [];
  // Labelled codes the server no longer lists (expired or deleted) still show, marked.
  const rows: (InviteRow & { gone: boolean })[] = [
    ...listed.map((i) => ({ ...i, gone: false })),
    ...labels
      .filter((l) => !listed.some((i) => i.code === l.code))
      .map((l) => ({
        code: l.code,
        uses: 0,
        maxUses: 0,
        expiresAt: null,
        inviter: null,
        channel: null,
        vanity: false,
        gone: invites !== null,
      })),
  ];
  const shown = rows.filter((r) => {
    const l = byCode.get(r.code);
    if (filter === "all") return true;
    if (filter === "none") return !l?.category;
    return l?.category === filter;
  });
  const full = labels.length >= Math.min(limit, INVITE_LIMITS.labels);
  const set = (code: string, patch: Partial<InviteLabel>) =>
    setLabels(labels.map((l) => (l.code === code ? { ...l, ...patch } : l)));
  const label = (code: string) => {
    if (byCode.has(code)) {
      setOpen(code);
      return;
    }
    if (full) return;
    setLabels([
      ...labels,
      {
        code,
        name: code,
        color: null,
        description: null,
        category: null,
        roleId: null,
        partner: null,
      },
    ]);
    setOpen(code);
  };
  const pasted = paste.trim() ? inviteCode(paste) : null;
  const blocked = labels.some((l) => !l.name.trim()) ? "Give each labelled invite a name." : null;

  return (
    <div ref={signal} className="invites" data-hold={blocked ?? undefined}>
      <input type="hidden" name="labels" value={JSON.stringify(labels)} />
      <div className="invites__bar">
        <div className="chip-filter" role="radiogroup" aria-label="Show">
          {[["all", "All"], ...categories.map((c) => [c, c]), ["none", "No category"]].map(
            ([value, text]) => (
              <label className="chip-filter__item" key={value}>
                <input
                  type="radio"
                  name="invite-filter"
                  form="invite-filter-none"
                  checked={filter === value}
                  onChange={() => setFilter(value as string)}
                />
                <span className="chip-filter__chip">{text}</span>
              </label>
            ),
          )}
        </div>
        <div className="invites__track">
          <label className="sr-only" htmlFor="invite-paste">
            Track an invite made elsewhere
          </label>
          <input
            className="g-input mono"
            id="invite-paste"
            value={paste}
            placeholder="discord.gg/… from Disboard or a social bio"
            autoComplete="off"
            form="invite-filter-none"
            aria-invalid={Boolean(paste.trim() && !pasted)}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            className="g-btn g-btn--secondary g-btn--sm"
            disabled={!pasted || (full && !byCode.has(pasted ?? ""))}
            onClick={() => {
              if (!pasted) return;
              label(pasted);
              setPaste("");
            }}
          >
            Track it
          </button>
        </div>
      </div>
      {invites === null ? (
        <p className="notice" role="alert">
          Discord won't list this server's invites to Garrison: give its role Manage Server (Server
          Settings, Roles). Labels you saved still show.
        </p>
      ) : null}

      <ul className="invite-list">
        {shown.map((r) => {
          const l = byCode.get(r.code);
          const s = stats[r.code];
          const editing = open === r.code && l;
          return (
            <li className="invite-row" key={r.code} data-gone={r.gone ? "" : undefined}>
              <div className="invite-row__main">
                <span className="invite-row__dot" ref={tint(l?.color ?? null)} aria-hidden="true" />
                <span className="invite-row__name">
                  {l ? (
                    <>
                      <strong>{l.name}</strong>
                      <span className="invite-row__code mono muted">
                        {r.vanity ? "vanity · " : ""}
                        {r.code}
                      </span>
                    </>
                  ) : (
                    <strong className="mono">
                      {r.code}
                      {r.vanity ? <span className="muted"> · vanity</span> : null}
                    </strong>
                  )}
                </span>
                {l?.category ? <span className="g-badge">{l.category}</span> : null}
                <span className="invite-row__meta muted">
                  {r.gone
                    ? "Expired or deleted"
                    : [
                        r.inviter ? `by ${r.inviter}` : null,
                        r.channel ? `#${r.channel}` : null,
                        `${r.uses}${r.maxUses ? `/${r.maxUses}` : ""} uses`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                <span className="invite-row__stats">
                  <span>
                    <strong>{s?.joins ?? 0}</strong> joined
                  </span>
                  <span>
                    <strong>{pct(s)}</strong> stayed a week
                  </span>
                </span>
                <button
                  type="button"
                  className="g-btn g-btn--ghost g-btn--sm"
                  aria-expanded={Boolean(editing)}
                  disabled={!l && full}
                  onClick={() => (editing ? setOpen(null) : label(r.code))}
                >
                  {editing ? "Done" : l ? "Edit" : "Label"}
                </button>
              </div>
              {l?.description && !editing ? (
                <p className="invite-row__desc">{l.description}</p>
              ) : null}
              {editing ? (
                <div className="invite-row__edit">
                  <label className="g-field">
                    <span className="field-label">Name</span>
                    <input
                      className="g-input"
                      value={l.name}
                      maxLength={INVITE_LIMITS.name}
                      aria-invalid={!l.name.trim()}
                      onChange={(e) => set(r.code, { name: e.target.value })}
                    />
                  </label>
                  <label className="g-field">
                    <span className="field-label">Category</span>
                    <input
                      className="g-input"
                      list="invite-categories"
                      value={l.category ?? ""}
                      maxLength={INVITE_LIMITS.category}
                      placeholder="Socials, Partners, Ads…"
                      onChange={(e) =>
                        set(r.code, {
                          category: e.target.value || null,
                          partner:
                            e.target.value === PARTNERS
                              ? (l.partner ?? { server: "", contact: null, note: null })
                              : null,
                        })
                      }
                    />
                  </label>
                  <label className="g-field invite-row__color">
                    <span className="field-label">Color</span>
                    <input
                      type="color"
                      value={l.color ?? "#8a8f98"}
                      onChange={(e) => set(r.code, { color: e.target.value })}
                    />
                  </label>
                  <label className="g-field">
                    <span className="field-label">Joining gives</span>
                    <select
                      className="g-input"
                      value={l.roleId ?? ""}
                      onChange={(e) => set(r.code, { roleId: e.target.value || null })}
                    >
                      <option value="">No role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          @{role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="g-field invite-row__wide">
                    <span className="field-label">Description</span>
                    <input
                      className="g-input"
                      value={l.description ?? ""}
                      maxLength={INVITE_LIMITS.description}
                      placeholder="Where this link lives: our Disboard listing, the YouTube bio…"
                      onChange={(e) => set(r.code, { description: e.target.value || null })}
                    />
                  </label>
                  {l.category === PARTNERS ? (
                    <fieldset className="invite-row__partner invite-row__wide">
                      <legend className="g-label">Partner</legend>
                      <label className="g-field">
                        <span className="field-label">Their server</span>
                        <input
                          className="g-input"
                          value={l.partner?.server ?? ""}
                          maxLength={INVITE_LIMITS.server}
                          onChange={(e) =>
                            set(r.code, {
                              partner: {
                                server: e.target.value,
                                contact: l.partner?.contact ?? null,
                                note: l.partner?.note ?? null,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="g-field">
                        <span className="field-label">Contact</span>
                        <input
                          className="g-input"
                          value={l.partner?.contact ?? ""}
                          maxLength={INVITE_LIMITS.contact}
                          placeholder="Who to talk to there"
                          onChange={(e) =>
                            set(r.code, {
                              partner: {
                                server: l.partner?.server ?? "",
                                contact: e.target.value || null,
                                note: l.partner?.note ?? null,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="g-field invite-row__wide">
                        <span className="field-label">The deal</span>
                        <input
                          className="g-input"
                          value={l.partner?.note ?? ""}
                          maxLength={INVITE_LIMITS.note}
                          placeholder="What each side posts, when it renews"
                          onChange={(e) =>
                            set(r.code, {
                              partner: {
                                server: l.partner?.server ?? "",
                                contact: l.partner?.contact ?? null,
                                note: e.target.value || null,
                              },
                            })
                          }
                        />
                      </label>
                    </fieldset>
                  ) : null}
                  <div className="invite-row__wide invite-row__foot">
                    <button
                      type="button"
                      className="g-btn g-btn--ghost g-btn--sm"
                      onClick={() => {
                        setLabels(labels.filter((x) => x.code !== r.code));
                        setOpen(null);
                      }}
                    >
                      Remove label
                    </button>
                    {l.roleId ? (
                      <span className="g-help">
                        Given when Garrison can tell this invite was used (not during a rush of
                        joins).
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!shown.length ? (
        <p className="g-help">
          {rows.length ? "No invites in this category." : "This server has no invites yet."}
        </p>
      ) : null}
      <datalist id="invite-categories">
        {suggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <p className="g-help">
        Joins and stays count the last {days} days. {labels.length} of {limit} labelled
        {limit < INVITE_LIMITS.labels ? `; Pro labels up to ${INVITE_LIMITS.labels}` : ""}.
      </p>
      {blocked ? (
        <p className="g-help g-help--warn" role="status">
          {blocked} Nothing saves until then.
        </p>
      ) : null}
    </div>
  );
}
