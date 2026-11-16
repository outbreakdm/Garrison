"use client";

import { tryPatterns } from "@garrison/db/cards";
import { useEffect, useState } from "react";

const values = (form: HTMLFormElement | null, name: string) =>
  form
    ? [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)]
        .map((i) => i.value.trim())
        .filter(Boolean)
    : [];

/**
 * Try the patterns on a line before members do: which pattern catches it, what it caught,
 * and whether an allowed word lets it through. Reads the panel's boxes as they are typed,
 * so it tests what's on screen, saved or not. Outside the panel's form: typing here saves
 * nothing.
 */
export function PatternTester({ formId }: { formId: string }) {
  const [text, setText] = useState("");
  const [lists, setLists] = useState<{ patterns: string[]; allow: string[] }>({
    patterns: [],
    allow: [],
  });
  useEffect(() => {
    const read = () => {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      setLists({ patterns: values(form, "regexPatterns"), allow: values(form, "regexAllow") });
    };
    read();
    // Boxes come and go (added, removed): read again after any change on the page.
    document.addEventListener("input", read);
    document.addEventListener("change", read);
    document.addEventListener("click", read);
    return () => {
      document.removeEventListener("input", read);
      document.removeEventListener("change", read);
      document.removeEventListener("click", read);
    };
  }, [formId]);

  const result = text.trim() ? tryPatterns(lists.patterns, lists.allow, text) : null;
  return (
    <div className="pattern-test">
      <label className="g-field" htmlFor="pattern-test">
        <span className="field-label">Try a message</span>
        <input
          className="g-input"
          id="pattern-test"
          value={text}
          maxLength={2000}
          placeholder="Type what a member might send"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="pattern-test__result" role="status" data-tone={tone(result)}>
        {!result
          ? lists.patterns.length
            ? "Type a message to see whether a pattern catches it."
            : "Add a pattern above, then try it here."
          : result.match
            ? result.allowed
              ? `Pattern ${result.match.index + 1} matches “${result.match.found}”, but “${result.allowed}” is allowed, so it goes through.`
              : `Blocked: pattern ${result.match.index + 1} matches “${result.match.found}”.`
            : "Goes through: no pattern matches."}
        {result?.untested.length
          ? ` This page can't run pattern ${result.untested.map((i) => i + 1).join(", ")}; Discord checks it when it's saved.`
          : ""}
      </p>
      <p className="g-help">
        Tested here with your browser's engine, which reads patterns almost the same way Discord
        does. Discord has the last word.
      </p>
    </div>
  );
}

function tone(result: ReturnType<typeof tryPatterns> | null) {
  if (!result) return undefined;
  if (result.match && !result.allowed) return "blocked";
  return "through";
}
