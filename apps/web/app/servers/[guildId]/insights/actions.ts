"use server";

import {
  getInsightsShare,
  makeInsightsShare,
  setInsightsShareEmbed,
  stopInsightsShare,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * The Insights share link. Only a manager makes, replaces or stops it, or lets other sites
 * embed it: it shows the server's counts to anyone holding the address.
 */
async function manager(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "manager");
  if (!access) redirect("/servers");
  return { ...access, path: `/servers/${access.guild.id}/insights` };
}

export async function makeShare(form: FormData) {
  const { guild, session, path } = await manager(form);
  const db = await getDb();
  const had = await getInsightsShare(db, guild.id);
  await makeInsightsShare(db, guild.id, session.username);
  return flashBack(
    path,
    {
      ok: had
        ? "Made a new link. The old one no longer opens."
        : "Made a share link. Anyone with it sees these counts and charts.",
    },
    "#share",
  );
}

export async function setShareEmbed(form: FormData) {
  const { guild, path } = await manager(form);
  const on = form.get("embed") === "on";
  await setInsightsShareEmbed(await getDb(), guild.id, on);
  return flashBack(
    path,
    {
      ok: on
        ? "Other sites (Notion, a wiki) can show the link now."
        : "Other sites can't show the link anymore; it still opens on its own.",
    },
    "#share",
  );
}

export async function stopShare(form: FormData) {
  const { guild, path } = await manager(form);
  await stopInsightsShare(await getDb(), guild.id);
  return flashBack(path, { ok: "Stopped sharing. The link no longer opens." }, "#share");
}
