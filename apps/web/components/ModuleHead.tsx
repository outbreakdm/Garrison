import Link from "next/link";

/**
 * The top right of a module page says whether it's running, always in the same place.
 *
 * HeadSwitch: the module's own on/off. It belongs to a self-saving panel's form
 * (form="<id>-form"), so flipping it saves through that panel's action, with its checks,
 * history and Undo. Key it on the panel's stamp so Undo puts it back.
 *
 * HeadStatus: for modules that run once something is set up (a log channel, a posted menu):
 * what's running, or the one thing to do first, linked to where it's done.
 */
export function HeadSwitch({
  label,
  name,
  form,
  defaultChecked,
  disabled,
}: {
  /** The module, as the menu names it: "Automod". */
  label: string;
  name: string;
  form: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="switch head-state head-state--switch">
      <span className="head-state__text">
        <span className="head-state__label">{label}</span>
        <span className="head-state__word" aria-hidden="true">
          <span className="head-state__on">On</span>
          <span className="head-state__off">Off</span>
        </span>
      </span>
      <input
        type="checkbox"
        name={name}
        form={form}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={`${label} on`}
      />
    </label>
  );
}

export function HeadStatus({
  on,
  text,
  href,
  action,
  word = on ? "On" : "Off",
}: {
  on: boolean;
  /** "On" or "Off" by default; null for pages about activity, not a module (Giveaways). */
  word?: string | null;
  /** What's running ("3 menus posted"), or why it isn't ("No log channel yet"). */
  text: string;
  /** Where to set it up: an anchor on this page ("#settings") or a page. */
  href?: string;
  /** The link's words: "Pick one". */
  action?: string;
}) {
  return (
    <p className="head-state head-state--status" data-on={on ? "" : undefined}>
      <span className="head-state__dot" aria-hidden="true" />
      {word ? (
        <>
          <span className="head-state__word">{word}</span>
          <span className="head-state__sep" aria-hidden="true">
            ·
          </span>
        </>
      ) : null}
      <span className="head-state__detail">{text}</span>
      {href && action ? (
        href.startsWith("#") ? (
          <a className="head-state__go" href={href}>
            {action}
          </a>
        ) : (
          <Link className="head-state__go" href={href}>
            {action}
          </Link>
        )
      ) : null}
    </p>
  );
}
