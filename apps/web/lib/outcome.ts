import "server-only";
import { refresh } from "next/cache";
import { type AutoResult, isAuto } from "./autosave";
import { flashBack } from "./flash";

export type Outcome = { ok: string; changeId?: string | null } | { error: string } | "unchanged";

/**
 * Answer a settings form. A panel that saves itself (`_auto=1`) gets the outcome as a value,
 * with the page's data refreshed in the same reply; a plain post goes back to `path` with
 * the outcome shown once (lib/flash).
 */
export async function answer(
  form: FormData,
  path: string,
  outcome: Outcome,
  suffix = "",
): Promise<AutoResult> {
  if (isAuto(form)) {
    if (outcome === "unchanged") return { status: "unchanged" };
    if ("error" in outcome) return { status: "error", message: outcome.error };
    refresh();
    return { status: "saved", message: outcome.ok, changeId: outcome.changeId ?? null };
  }
  return flashBack(
    path,
    outcome === "unchanged"
      ? { error: "Nothing changed." }
      : "error" in outcome
        ? { error: outcome.error }
        : { ok: outcome.ok },
    suffix,
  );
}
