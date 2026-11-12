import {
  checkTemplates,
  getGuildPlan,
  getRallyTemplates,
  PLAN_LIMITS,
  parseSlots,
  type RallyTemplate,
  renderWording,
  TEMPLATE_PRESETS,
  WORDING_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { addTemplate, removeTemplate, saveTemplate } from "./actions";

export const metadata: Metadata = { title: "Rally templates" };

const WORDING_FIELDS = [
  ["group", "What a group is called", "squad, party, fireteam, raid"],
  ["join", "Join button (with roles)", "Join as {role}"],
  ["joinAny", "Join button (no roles)", "Join"],
  ["leave", "Leave button", "Leave"],
  ["close", "Close button", "Close {group}"],
  ["full", "When it fills up", "{Group}'s full."],
  ["requirement", "Requirement label", "Item level, Rank, Power"],
] as const;

/** How a post from this template looks in Discord. Rendered on the server from saved values. */
function Preview({ t }: { t: RallyTemplate }) {
  const w = t.wording;
  const slots = parseSlots(t.roles, t.size);
  const groups = slots.ok ? slots.value : [];
  return (
    <figure className="g-lfg g-lfg--wide preview" aria-label={`Preview of ${t.name}`}>
      <div className="g-lfg__head">
        <span className="g-lfg__title">{t.game ? `${t.name} · ${t.game}` : t.name}</span>
        <span className="g-badge g-badge--accent">Open</span>
      </div>
      <div className="g-lfg__meta">@host · now{w.requirement ? ` · ${w.requirement}: …` : ""}</div>
      <div className="preview__groups">
        {groups.map((g) => (
          <span key={g.name || "any"} className="mono">
            {g.name || renderWording("{Group}", w)} · 1/{g.count}
          </span>
        ))}
      </div>
      <div className="preview__buttons">
        {groups.map((g, i) => (
          <span
            key={g.name || "any"}
            className={`g-btn ${i === 0 ? "g-btn--primary" : "g-btn--secondary"}`}
          >
            {g.name ? renderWording(w.join, w, { role: g.name }) : renderWording(w.joinAny, w)}
          </span>
        ))}
        <span className="g-btn g-btn--secondary">{renderWording(w.leave, w)}</span>
        <span className="g-btn g-btn--danger">{renderWording(w.close, w)}</span>
      </div>
      <div className="g-help">
        When full: “{renderWording(w.full, w)}”
        {t.voice ? " and a members-only voice channel opens." : ""}
      </div>
    </figure>
  );
}

export default async function RallyTemplatesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [raw, plan, channels, roles] = await Promise.all([
    getRallyTemplates(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listNotifiableRoles(guild.id).catch(() => []),
  ]);
  const checked = checkTemplates(raw, "pro");
  const templates = checked.ok ? checked.value : [];
  const limit = PLAN_LIMITS[plan];
  const full = templates.length >= limit.templates;
  const flash = await readFlash();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>LFG templates</h1>
          <p>
            Make Rally fit each game: default roles, the words on every button and message, where it
            can be posted. Players pick one with /lfg create template:.
          </p>
        </div>
        <span className="mono">
          {plan === "pro" ? "Pro" : "Free"} · {templates.length} of {limit.templates} templates
        </span>
      </div>
      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}
      {templates.length > limit.templates ? (
        <div className="notice" role="alert">
          This server has {templates.length} templates, but its plan includes {limit.templates}.
          Only the first {limit.templates} can be used until you remove some or upgrade.
        </div>
      ) : null}

      <form action={addTemplate} className="g-card card-col">
        <input type="hidden" name="guildId" value={guild.id} />
        <h2 className="card-title">Add a template</h2>
        <div className="field-row">
          <label className="g-field">
            <span>Start from</span>
            <select className="g-input" name="preset" defaultValue="dungeon">
              {Object.entries(TEMPLATE_PRESETS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.name}
                  {p.game ? ` (${p.game})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="g-field">
            <span>Name</span>
            <input
              className="g-input"
              name="name"
              maxLength={32}
              placeholder="Keeps the preset's name"
            />
          </label>
        </div>
        <p className="g-help">
          Presets are only a starting point: every word can be changed, so any game works.
          {plan === "free"
            ? ` Free servers get ${PLAN_LIMITS.free.templates} templates; Garrison Pro gets ${PLAN_LIMITS.pro.templates} and role notifications.`
            : ""}
        </p>
        <button type="submit" className="g-btn g-btn--primary" disabled={full}>
          {full ? `${limit.templates} of ${limit.templates} templates used` : "Add template"}
        </button>
      </form>

      {templates.map((t) => (
        <details className="g-card template" id={t.id} key={`${t.id}-${contentKey(t)}`}>
          <summary className="row-between">
            <span>
              <strong>{t.name}</strong>
              {t.game ? <span className="muted"> · {t.game}</span> : null}
              {t.isDefault ? <span className="g-badge g-badge--accent"> Default</span> : null}
            </span>
            <span className="g-help">Edit</span>
          </summary>
          <div className="template__body">
            <form action={saveTemplate} className="card-col">
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="templateId" value={t.id} />
              <div className="field-row">
                <label className="g-field">
                  <span>Name</span>
                  <input
                    className="g-input"
                    name="name"
                    maxLength={32}
                    required
                    defaultValue={t.name}
                  />
                </label>
                <label className="g-field">
                  <span>Game</span>
                  <input
                    className="g-input"
                    name="game"
                    maxLength={40}
                    defaultValue={t.game ?? ""}
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="g-field">
                  <span>Roles and counts</span>
                  <input
                    className="g-input"
                    name="roles"
                    maxLength={120}
                    defaultValue={t.roles ?? ""}
                    placeholder="Tank 1, Healer 1, DPS 3"
                  />
                </label>
                <label className="g-field">
                  <span>Or a size (no roles)</span>
                  <input
                    className="g-input"
                    name="size"
                    type="number"
                    min={2}
                    max={40}
                    defaultValue={t.size ?? ""}
                  />
                </label>
              </div>
              <fieldset className="wording">
                <legend className="g-label">Wording</legend>
                {WORDING_FIELDS.map(([key, label, hint]) => (
                  <label className="g-field" key={key}>
                    <span>{label}</span>
                    <input
                      className="g-input"
                      name={`w_${key}`}
                      maxLength={WORDING_LIMITS[key]}
                      defaultValue={t.wording[key] ?? ""}
                      placeholder={hint}
                    />
                  </label>
                ))}
                <p className="g-help">
                  Use {"{role}"}, {"{group}"} and {"{Group}"} as placeholders. Plain text only: no
                  mentions, links or markdown.
                </p>
              </fieldset>
              <div className="field-row">
                <label className="g-field">
                  <span>Posts stay open (hours after start)</span>
                  <input
                    className="g-input"
                    name="lifetimeHours"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={t.lifetimeHours}
                  />
                </label>
                <label className="g-field">
                  <span>Only in these channels</span>
                  <select
                    className="g-input"
                    name="channelIds"
                    multiple
                    size={4}
                    defaultValue={t.channelIds}
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  <span className="g-help">None selected: any channel.</span>
                </label>
              </div>
              <label className="g-field">
                <span>Notify a role when a post goes up {plan === "pro" ? "" : "(Pro)"}</span>
                <select
                  className="g-input"
                  name="notifyRoleId"
                  defaultValue={t.notifyRoleId ?? ""}
                  disabled={!limit.notifyRole}
                >
                  <option value="">Nobody</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                      {r.mentionable ? "" : " (not mentionable)"}
                    </option>
                  ))}
                </select>
                <span className="g-help">
                  At most once every 15 minutes per template. The role must be mentionable, or
                  Garrison needs Mention Everyone.
                </span>
              </label>
              <label className="check">
                <input type="checkbox" name="voice" defaultChecked={t.voice} />
                <span>Open a members-only voice channel when it fills</span>
              </label>
              <label className="check">
                <input type="checkbox" name="isDefault" defaultChecked={t.isDefault} />
                <span>Use when /lfg create names no template</span>
              </label>
              <button type="submit" className="g-btn g-btn--primary">
                Save {t.name}
              </button>
            </form>
            <div className="card-col">
              <span className="g-label">Preview</span>
              <Preview t={t} />
              <form action={removeTemplate}>
                <input type="hidden" name="guildId" value={guild.id} />
                <input type="hidden" name="templateId" value={t.id} />
                <button type="submit" className="g-btn g-btn--ghost">
                  Remove {t.name}
                </button>
              </form>
            </div>
          </div>
        </details>
      ))}
      {templates.length === 0 ? (
        <div className="g-card muted">
          No templates yet. Without one, /lfg create uses Garrison's standard wording.
        </div>
      ) : null}
      <p className="g-help">
        Every change is in{" "}
        <Link href={`/servers/${guild.id}/settings#history`}>Settings history</Link> and can be
        undone. Posts already up keep the wording they were posted with.
      </p>
    </>
  );
}
