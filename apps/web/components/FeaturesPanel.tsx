import { QM_SETTINGS, QM_SETTINGS_MODULES, type QmSettingsModule } from "@garrison/db";
import Link from "next/link";
import { saveFeature } from "@/app/servers/[guildId]/quartermaster/actions";

/** Each module's switch, if it has one, and where its full settings live. */
const MODULES: Record<QmSettingsModule, { href: string; on?: string; set?: string }> = {
  suggestions: { href: "/suggestions", on: "enabled" },
  starboard: { href: "/honors", on: "enabled" },
  voice: { href: "/voice", on: "enabled" },
  automod: { href: "/watch", on: "enabled" },
  welcome: { href: "/herald", on: "joinEnabled" },
  ranks: { href: "/ranks", on: "enabled" },
  ledger: { href: "/ledger", set: "channelId" },
  watch: { href: "/watch", set: "logChannelId" },
};

const words = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export interface Channels {
  text: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

function Hidden({ guildId, module, field }: { guildId: string; module: string; field: string }) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="field" value={field} />
    </>
  );
}

/** A switch that saves when flipped: a submit button that sends the opposite value. */
function Switch({
  guildId,
  module,
  field,
  on,
  label,
}: {
  guildId: string;
  module: string;
  field: string;
  on: boolean;
  label: string;
}) {
  return (
    <form action={saveFeature} className="qm-feat__switch">
      <Hidden guildId={guildId} module={module} field={field} />
      <input type="hidden" name="value" value={on ? "false" : "true"} />
      <button
        type="submit"
        className="g-toggle"
        role="switch"
        aria-checked={on}
        aria-label={label}
      />
    </form>
  );
}

function Field({
  guildId,
  module,
  name,
  value,
  channels,
  href,
}: {
  guildId: string;
  module: QmSettingsModule;
  name: string;
  value: unknown;
  channels: Channels;
  href: string;
}) {
  const spec = (
    QM_SETTINGS[module].fields as Record<
      string,
      { label: string; kind: string; options?: readonly string[]; min?: number; max?: number }
    >
  )[name];
  if (!spec) return null;
  const id = `qm-f-${module}-${name}`;
  if (spec.kind === "bool")
    return (
      <div className="qm-feat__row">
        <span className="qm-feat__label">{spec.label}</span>
        <Switch
          guildId={guildId}
          module={module}
          field={name}
          on={value === true}
          label={`${QM_SETTINGS[module].label}: ${spec.label}`}
        />
      </div>
    );
  if (spec.kind === "enum")
    return (
      <div className="qm-feat__field">
        <span className="qm-feat__label">{spec.label}</span>
        <form action={saveFeature} className="qm-seg">
          <Hidden guildId={guildId} module={module} field={name} />
          {(spec.options ?? []).map((o) => (
            <button
              key={o}
              type="submit"
              name="value"
              value={o}
              className="qm-seg__opt"
              aria-pressed={value === o}
            >
              {words(o)}
            </button>
          ))}
        </form>
      </div>
    );
  const pickChannel = spec.kind === "textChannel" || spec.kind === "category";
  const freeText = spec.kind === "int" || spec.kind === "text" || spec.kind === "emoji";
  if (!pickChannel && !freeText)
    return (
      <div className="qm-feat__row">
        <span className="qm-feat__label">{spec.label}</span>
        <Link
          className="qm-feat__more"
          href={`/servers/${guildId}${href}`}
          transitionTypes={["nav"]}
        >
          Set on its page
        </Link>
      </div>
    );
  const list = spec.kind === "category" ? channels.categories : channels.text;
  return (
    <form action={saveFeature} className="qm-feat__field">
      <Hidden guildId={guildId} module={module} field={name} />
      <label className="qm-feat__label" htmlFor={id}>
        {spec.label}
      </label>
      <div className="qm-feat__control">
        {pickChannel ? (
          <select
            className="g-input"
            id={id}
            name="value"
            defaultValue={typeof value === "string" ? value : ""}
          >
            <option value="">None</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {spec.kind === "category" ? c.name : `#${c.name}`}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="g-input"
            id={id}
            name="value"
            type={spec.kind === "int" ? "number" : "text"}
            min={spec.min}
            max={spec.max}
            maxLength={spec.kind === "text" ? 60 : 32}
            defaultValue={value === null || value === undefined ? "" : String(value)}
          />
        )}
        <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * The assistant's Features panel: the modules the assistant can set up, each with its
 * switch in the header and its settings inside, saved one at a time through the same
 * checks and Settings history as the module's own page.
 */
export function FeaturesPanel({
  guildId,
  values,
  channels,
}: {
  guildId: string;
  values: Partial<Record<QmSettingsModule, Record<string, unknown> | null>>;
  channels: Channels;
}) {
  return (
    <div className="qm-feats">
      {QM_SETTINGS_MODULES.map((m) => {
        const spec = QM_SETTINGS[m];
        const meta = MODULES[m];
        const v = values[m] ?? {};
        const on = meta.on ? v[meta.on] === true : Boolean(meta.set && v[meta.set]);
        const fields = Object.keys(spec.fields).filter((f) => f !== meta.on);
        return (
          <details className="qm-feat" key={m}>
            <summary className="qm-feat__head">
              <span className="qm-feat__cue" aria-hidden="true" />
              <span className="qm-feat__icon" aria-hidden="true" />
              <span className="qm-feat__name">{spec.label}</span>
              <span className={`qm-pill ${on ? "qm-pill--go" : ""}`}>{on ? "On" : "Off"}</span>
              {meta.on ? (
                <Switch
                  guildId={guildId}
                  module={m}
                  field={meta.on}
                  on={on}
                  label={`${spec.label} on`}
                />
              ) : null}
            </summary>
            <div className="qm-feat__body">
              {fields.map((f) => (
                <Field
                  key={f}
                  guildId={guildId}
                  module={m}
                  name={f}
                  value={v[f]}
                  channels={channels}
                  href={meta.href}
                />
              ))}
              <Link
                className="qm-feat__more"
                href={`/servers/${guildId}${meta.href}`}
                transitionTypes={["nav"]}
              >
                All {spec.label} settings
              </Link>
            </div>
          </details>
        );
      })}
    </div>
  );
}
