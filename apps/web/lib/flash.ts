import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The outcome of a form, shown once on the page it returns to. Messages travel in
 * a short-lived httpOnly cookie scoped to that page, not the URL, so a link can't
 * put arbitrary text on the page.
 */

const FLASH = "garrison_flash";

export type Flash = { ok?: string; error?: string };

/** Remember the outcome for `path`, then go back there (`suffix`: "?edit=x#x" or "#x"). */
export async function flashBack(
  path: string,
  outcome: { ok: string } | { error: string },
  suffix = "",
): Promise<never> {
  (await cookies()).set(FLASH, JSON.stringify(outcome), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path,
    maxAge: 20,
  });
  redirect(`${path}${suffix}`);
}

/** The outcome waiting for this page, if any. */
export async function readFlash(): Promise<Flash | null> {
  try {
    const c = (await cookies()).get(FLASH)?.value;
    const v = c ? (JSON.parse(c) as unknown) : null;
    if (!v || typeof v !== "object") return null;
    const { ok, error } = v as Record<string, unknown>;
    return {
      ok: typeof ok === "string" ? ok : undefined,
      error: typeof error === "string" ? error : undefined,
    };
  } catch {
    return null;
  }
}

/** A short, stable key for a value: remounts a form whenever what it edits changes. */
export function contentKey(value: unknown) {
  const s = JSON.stringify(value) ?? "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}
