import { redirect } from "next/navigation";
import { ANCHOR } from "@/lib/outcome";

/**
 * After a request: back to the page, and to the control the form came from
 * when it named one (`at`, an element ID), so the result shows where the user
 * is looking. Without one it lands on the Requests panel. Not a server action
 * file on purpose: only the actions that call this are endpoints.
 */
export function backTo(base: string, at: string, query: Record<string, string>): never {
  const anchor = ANCHOR.test(at) ? at : "";
  const params = new URLSearchParams(anchor ? { ...query, at: anchor } : query);
  redirect(`${base}?${params}#${anchor || "requests"}`);
}
