/** One part of Discord's form, as the preview draws it. */
export interface FormPreviewField {
  label: string;
  help?: string | null;
  /** A paragraph box instead of one line. */
  long?: boolean;
  required?: boolean;
  /** Filled in to start with. */
  value?: string | null;
  /** A dropdown of these instead of a box. */
  choices?: string[];
}

/**
 * Discord's form (a modal) as members see it: its title, each part with its label, the line
 * under it and its box or dropdown, then Cancel and Submit. Always Discord's dark theme.
 */
export function FormPreview({ title, fields }: { title: string; fields: FormPreviewField[] }) {
  return (
    <figure className="dc dc-form">
      <figcaption className="sr-only">Discord's form, as members see it</figcaption>
      <p className="dc-form__title">{title}</p>
      {fields.length ? (
        fields.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts have no IDs here; order is the identity
          <div className="dc-form__field" key={i}>
            <span className="dc-form__label">
              {f.label || `Question ${i + 1}`}
              {f.required ? (
                <span className="dc-form__req" aria-hidden="true">
                  *
                </span>
              ) : null}
            </span>
            {f.help ? <span className="dc-form__help">{f.help}</span> : null}
            {f.choices ? (
              <span className="dc-form__box dc-form__box--select">
                {f.choices[0] ?? "Pick one"}
              </span>
            ) : (
              <span className={f.long ? "dc-form__box dc-form__box--long" : "dc-form__box"}>
                {f.value ?? ""}
              </span>
            )}
          </div>
        ))
      ) : (
        <p className="dc-form__empty">Add a question and it shows here.</p>
      )}
      <div className="dc-form__foot">
        <span className="dc-form__cancel">Cancel</span>
        <span className="dc-form__submit">Submit</span>
      </div>
    </figure>
  );
}
