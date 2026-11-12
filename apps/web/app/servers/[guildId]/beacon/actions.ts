"use server";

import { randomInt } from "node:crypto";
import {
  type AlertFeed,
  applySettingsChange,
  checkAlertFeeds,
  entitlements,
  getAlertFeeds,
  getGuildPlan,
  newId,
  normalizeHandle,
  readAlertFeeds,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Alert edits. Each action re-checks access for the server in the form, re-reads
 * the plan, and validates the whole list with the same checker the bot reads by.
 * Channels and roles must belong to this server.
 */

const back = (guildId: string, outcome: { ok: string } | { error: string }, open = "") =>
  flashBack(`/servers/${guildId}/beacon`, outcome, `${open ? `?edit=${open}#${open}` : ""}`);

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getAlertFeeds(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, ent: entitlements(plan), feeds: readAlertFeeds(raw) };
}

type Ctx = Awaited<ReturnType<typeof load>>;

/** The channel and role a feed names must be this server's. */
async function belongs(guildId: string, feed: { channelId: string; roleId: string | null }) {
  const [channels, roles] = await Promise.all([
    listTextChannels(guildId).catch(() => null),
    listNotifiableRoles(guildId).catch(() => null),
  ]);
  if (!channels || !roles) return "Discord didn't answer. Try again.";
  if (!channels.some((c) => c.id === feed.channelId)) return "Pick a text channel in this server.";
  if (feed.roleId && !roles.some((r) => r.id === feed.roleId))
    return "Pick the role to ping from this server's list.";
  return null;
}

async function save(ctx: Ctx, next: unknown[], ok: string, open = "") {
  const checked = checkAlertFeeds(next, ctx.ent, ctx.feeds);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, open);
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "alerts",
    patch: { feeds: checked.value },
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.guild.id,
      { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
      open,
    );
  return back(ctx.guild.id, { ok }, open);
}

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addFeed(form: FormData) {
  const ctx = await load(form);
  const provider = form.get("provider") === "youtube" ? "youtube" : "twitch";
  const handle = normalizeHandle(provider, String(form.get("handle") ?? ""));
  if (!handle)
    return back(
      ctx.guild.id,
      {
        error:
          provider === "twitch"
            ? "Enter a Twitch username, like shroud."
            : "Enter a YouTube @handle or a channel link.",
      },
      "new",
    );
  const feed: AlertFeed = {
    id: newId(crypto01),
    provider,
    handle,
    channelId: String(form.get("channelId") ?? ""),
    roleId: String(form.get("roleId") ?? "") || null,
    message: null,
    accent: null,
  };
  const problem = await belongs(ctx.guild.id, feed);
  if (problem) return back(ctx.guild.id, { error: problem }, "new");
  return save(
    ctx,
    [...ctx.feeds, feed],
    `Added ${handle}. Garrison checks it within a few minutes; the first check only notes what's there.`,
    feed.id,
  );
}

export async function saveFeed(form: FormData) {
  const ctx = await load(form);
  let feed: AlertFeed;
  try {
    feed = JSON.parse(String(form.get("feed") ?? "")) as AlertFeed;
  } catch {
    return back(ctx.guild.id, { error: "That form wasn't valid. Refresh and try again." });
  }
  const id = typeof feed?.id === "string" ? feed.id : "";
  const was = ctx.feeds.find((f) => f.id === id);
  if (!was) return back(ctx.guild.id, { error: "That alert was removed. Refresh and try again." });
  // The provider is fixed once added: changing it would be a different alert.
  const next = { ...feed, provider: was.provider };
  const problem = await belongs(ctx.guild.id, {
    channelId: String(next.channelId),
    roleId: next.roleId ? String(next.roleId) : null,
  });
  if (problem) return back(ctx.guild.id, { error: problem }, id);
  return save(
    ctx,
    ctx.feeds.map((f) => (f.id === id ? next : f)),
    "Saved the alert.",
    id,
  );
}

export async function removeFeed(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("feedId") ?? "");
  const gone = ctx.feeds.find((f) => f.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That alert was already removed." });
  return save(
    ctx,
    ctx.feeds.filter((f) => f.id !== id),
    `Removed the alert for ${gone.handle}. Undo it from Settings history.`,
  );
}
