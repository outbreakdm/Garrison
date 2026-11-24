import {
  APPLICATION_LIMITS,
  type ApplicationForm,
  entitlements,
  getApplicationForms,
  getGuildPlan,
  listApplications,
  readApplicationForms,
  VERIFY_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import { formatTime } from "@/components/format";
import { HowItWorks } from "@/components/HowItWorks";
import { HeadStatus } from "@/components/ModuleHead";
import { RequestsPanel } from "@/components/RequestsPanel";
import { CheckList } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { removeForm, saveForm } from "./actions";

export const metadata: Metadata = { title: "Applications" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A form's fields: blank for a new one. Questions are five rows; empty rows are skipped. */
function FormFields({
  f,
  channels,
  roles,
}: {
  f: ApplicationForm | null;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}) {
  const rows = Array.from({ length: VERIFY_LIMITS.parts }, (_, i) => f?.questions[i] ?? null);
  return (
    <div className="appl__fields">
      <div className="appl__pair">
        <label className="g-field">
          <span className="g-label">Name</span>
          <input
            className="g-input"
            name="name"
            defaultValue={f?.name ?? ""}
            maxLength={APPLICATION_LIMITS.name}
            placeholder="Raid team"
            required
          />
        </label>
        <label className="g-field">
          <span className="g-label">Button</span>
          <input
            className="g-input"
            name="buttonLabel"
            defaultValue={f?.buttonLabel ?? "Apply"}
            maxLength={APPLICATION_LIMITS.button}
          />
        </label>
      </div>
      <label className="g-field">
        <span className="g-label">Panel title</span>
        <input
          className="g-input"
          name="title"
          defaultValue={f?.title ?? ""}
          maxLength={APPLICATION_LIMITS.title}
          placeholder="Join the raid team"
          required
        />
      </label>
      <label className="g-field">
        <span className="g-label">Panel text</span>
        <textarea
          className="g-input"
          name="body"
          rows={2}
          defaultValue={f?.body ?? ""}
          maxLength={APPLICATION_LIMITS.body}
          placeholder="We raid Tuesdays and Thursdays at 8 PM. Tell us about your character."
        />
      </label>
      <label className="g-field">
        <span className="g-label">Note at the top of the form (optional)</span>
        <textarea
          className="g-input"
          name="intro"
          rows={2}
          defaultValue={f?.intro ?? ""}
          maxLength={VERIFY_LIMITS.intro}
        />
        <span className="g-help">Discord's form holds five parts: the note counts as one.</span>
      </label>
      <fieldset className="appl__questions">
        <legend className="g-label">Questions</legend>
        {rows.map((q, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed question rows
          <div className="appl__q" key={i}>
            <input type="hidden" name="qid" value={q?.id ?? ""} />
            <input
              className="g-input"
              name="qlabel"
              defaultValue={q?.label ?? ""}
              maxLength={VERIFY_LIMITS.label}
              placeholder={i === 0 ? "What class and level do you play?" : `Question ${i + 1}`}
              aria-label={`Question ${i + 1}`}
              required={i === 0}
            />
            <input
              className="g-input"
              name="qhelp"
              defaultValue={q?.help ?? ""}
              maxLength={VERIFY_LIMITS.help}
              placeholder="Hint (optional)"
              aria-label={`Hint for question ${i + 1}`}
            />
            <select
              className="g-input"
              name="qlong"
              defaultValue={q?.long ? "long" : "short"}
              aria-label={`Answer box for question ${i + 1}`}
            >
              <option value="short">One line</option>
              <option value="long">Paragraph</option>
            </select>
          </div>
        ))}
      </fieldset>
      <div className="appl__pair">
        <label className="g-field">
          <span className="g-label">Applications go to</span>
          <select
            className="g-input"
            name="reviewChannelId"
            defaultValue={f?.reviewChannelId ?? ""}
            required
          >
            <option value="" disabled>
              Pick a staff channel
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <CheckList
          name="acceptRoleIds"
          label="Roles given on accept"
          value={f?.acceptRoleIds ?? []}
          options={roles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
          help={`Up to ${APPLICATION_LIMITS.roles}. Roles with staff powers aren't offered.`}
        />
      </div>
    </div>
  );
}

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId, "applications");
  const query = await searchParams;
  const db = await getDb();
  const [raw, plan, recent, channels, allRoles, flash] = await Promise.all([
    getApplicationForms(db, guild.id),
    getGuildPlan(db, guild.id),
    listApplications(db, guild.id, 50),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const forms = readApplicationForms(raw);
  const limit = ent["applications.forms"];
  const waiting = recent.filter((a) => a.status === "waiting");
  const decided = recent.filter((a) => a.status !== "waiting").slice(0, 15);
  const roles = allRoles
    .filter((r) => r.id !== guild.id && !r.managed && !isDangerousRole(r.permissions))
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
  const textChannels = channels.map((c) => ({ id: c.id, name: c.name }));
  const roleName = new Map(allRoles.map((r) => [r.id, r.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Applications</h1>
          <p>Recruitment and staff forms: members apply in Discord, staff accept or decline.</p>
          <HowItWorks>
            Post a form's panel; its button opens Discord's form. Answers go to your staff channel
            with Accept and Decline, and accepting gives the form's roles.
          </HowItWorks>
        </div>
        <HeadStatus
          on={waiting.length > 0}
          word={null}
          text={
            waiting.length
              ? `${plural(waiting.length, "application")} waiting`
              : forms.length
                ? `${plural(forms.length, "form")}, nothing waiting`
                : "No forms yet"
          }
          href={forms.length ? undefined : "#new-form"}
          action="Make one"
        />
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

      <RequestsPanel
        guildId={guild.id}
        kinds={["post_application_panel", "application_decide"]}
        query={query}
      />

      <section className="g-card appl" id="review" aria-labelledby="review-title">
        <h2 className="card-title" id="review-title">
          Waiting for staff
        </h2>
        {waiting.length ? (
          <ul className="appl__list">
            {waiting.map((a) => (
              <li key={a.id} className="appl__app">
                <div className="appl__who">
                  <strong>{a.username}</strong>
                  <span className="muted">
                    {a.formName} · {formatTime(a.createdAt, "UTC")}
                  </span>
                </div>
                <dl className="appl__answers">
                  {a.answers.map((x) => (
                    <div key={x.label}>
                      <dt>{x.label}</dt>
                      <dd>{x.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="appl__decide">
                  {(["accept", "decline"] as const).map((op) => (
                    <form action={requestAction} key={op}>
                      <input type="hidden" name="guildId" value={guild.id} />
                      <input type="hidden" name="page" value="applications" />
                      <input type="hidden" name="kind" value="application_decide" />
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="op" value={op} />
                      <button
                        type="submit"
                        className={`g-btn g-btn--sm ${op === "accept" ? "g-btn--primary" : "g-btn--ghost"}`}
                      >
                        {op === "accept" ? "Accept" : "Decline"}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="appl__empty">
            Nothing waiting. New applications show here and in each form's staff channel.
          </p>
        )}
        {decided.length ? (
          <details className="appl__past">
            <summary>Decided lately ({decided.length})</summary>
            <ul className="appl__done">
              {decided.map((a) => (
                <li key={a.id}>
                  <strong>{a.username}</strong> · {a.formName} ·{" "}
                  {a.status === "accepted" ? "accepted" : "declined"}
                  {a.decidedBy ? ` by ${a.decidedBy}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="g-card appl" id="forms" aria-labelledby="forms-title">
        <h2 className="card-title" id="forms-title">
          Forms
        </h2>
        <p className="card-sub">
          {forms.length} of {limit} used.{" "}
          {plan === "free"
            ? `Garrison Pro runs up to ${APPLICATION_LIMITS.forms}.`
            : "Kept 90 days after someone applies."}
        </p>
        {forms.length ? (
          <ul className="appl__list">
            {forms.map((f, i) => (
              <li key={f.id} className="appl__form" id={`form-${f.id}`}>
                <details>
                  <summary className="appl__summary">
                    <span className="appl__name">{f.name}</span>
                    <span className="muted">
                      {plural(f.questions.length, "question")}
                      {f.acceptRoleIds.length
                        ? ` · gives ${f.acceptRoleIds.map((r) => `@${roleName.get(r) ?? "a deleted role"}`).join(", ")}`
                        : ""}
                      {i >= limit ? " · paused on this plan" : ""}
                    </span>
                  </summary>
                  <form action={requestAction} className="appl__post">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="page" value="applications" />
                    <input type="hidden" name="kind" value="post_application_panel" />
                    <input type="hidden" name="formId" value={f.id} />
                    <label className="g-field">
                      <span className="g-label">Post its panel in</span>
                      <select className="g-input" name="channelId" required defaultValue="">
                        <option value="" disabled>
                          Pick a channel
                        </option>
                        {textChannels.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                      Post
                    </button>
                  </form>
                  <form action={saveForm} className="appl__edit">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={f.id} />
                    <FormFields f={f} channels={textChannels} roles={roles} />
                    <div className="appl__do">
                      <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                        Save
                      </button>
                    </div>
                  </form>
                  <form action={removeForm} className="appl__remove">
                    <input type="hidden" name="guildId" value={guild.id} />
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                      Remove
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        ) : null}
        {forms.length >= limit ? (
          <p className="appl__empty">
            This server has {plural(limit, "form")}, its plan's most.
            {plan === "free" ? ` Garrison Pro runs up to ${APPLICATION_LIMITS.forms}.` : ""}
          </p>
        ) : (
          <details className="appl__new" id="new-form" open={!forms.length}>
            <summary className="g-btn g-btn--secondary g-btn--sm">New form</summary>
            <form action={saveForm} className="appl__edit">
              <input type="hidden" name="guildId" value={guild.id} />
              <FormFields f={null} channels={textChannels} roles={roles} />
              <div className="appl__do">
                <button type="submit" className="g-btn g-btn--primary g-btn--sm">
                  Add form
                </button>
              </div>
            </form>
          </details>
        )}
      </section>
    </>
  );
}
