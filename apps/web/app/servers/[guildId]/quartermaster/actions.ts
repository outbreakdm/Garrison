"use server";

import { deleteTemplate } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/** Delete one of your own server templates. Only ever the signed-in member's. */
export async function removeTemplate(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const id = String(form.get("templateId") ?? "");
  const ok =
    /^[0-9a-f-]{36}$/.test(id) && (await deleteTemplate(await getDb(), access.session.userId, id));
  return flashBack(
    `/servers/${access.guild.id}/quartermaster`,
    ok ? { ok: "Template deleted." } : { error: "That template was already gone." },
    "#templates",
  );
}
