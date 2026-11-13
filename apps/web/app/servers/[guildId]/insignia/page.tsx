import {
  entitlements,
  getGuildPlan,
  getRoleMenus,
  isPaused,
  listRoleMenuPosts,
  MENU_HARD_MAX,
  menuLimit,
  ROLE_MENU_PRESETS,
  readRoleMenus,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PlansLink } from "@/components/ProUpsell";
import { RequestsPanel } from "@/components/RequestsPanel";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { botTopPosition, listGuildEmojis, listGuildRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "../requests";
import { addMenu, removeMenu, saveMenu } from "./actions";
import { type RoleChoice, RoleMenuEditor } from "./RoleMenuEditor";

export const metadata: Metadata = { title: "Role menus" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function RoleMenusPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [raw, plan, posts, channels, roles, botTop, serverEmoji] = await Promise.all([
    getRoleMenus(db, guild.id),
    getGuildPlan(db, guild.id),
    listRoleMenuPosts(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listGuildRoles(guild.id).catch(() => []),
    botTopPosition(guild.id),
    listGuildEmojis(guild.id).catch(() => []),
  ]);
  const ent = entitlements(plan);
  const menus = readRoleMenus(raw);
  const limit = menuLimit(ent);
  const full = menus.length >= limit;
  const pausedCount = Math.max(0, menus.length - limit);
  const editing = typeof query.edit === "string" ? query.edit : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  // Roles a menu can hand out: never managed by an integration, never with
  // moderation or admin powers. The bot checks again on every click.
  const give: RoleChoice[] = roles
    .filter((r) => !r.managed && !isDangerousRole(r.permissions))
    .map((r) => ({
      id: r.id,
      name: r.name,
      aboveBot: botTop !== null && r.position >= botTop,
    }));
  const need = roles.filter((r) => !r.managed).map(({ id, name }) => ({ id, name }));

  const flash = await readFlash();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Role menus</h1>
          <p>
            A card in Discord with buttons or a dropdown, so members pick their own roles: games,
            pings, name colors. Design it here, post it, and every click is checked against what you
            saved.
          </p>
        </div>
        <span className="mono">
          {plan === "pro" ? "Pro" : "Free"} · {menus.length} of {limit} menus
        </span>
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}
      {pausedCount ? (
        <div className="notice notice--pro" role="status">
          <span>
            This server has {menus.length} menus and its plan runs {limit}, so the last{" "}
            {plural(pausedCount, "menu is", "menus are")} paused: still saved, buttons resting.
            Remove a menu, or a paid plan brings {pausedCount === 1 ? "it" : "them"} back.{" "}
            <PlansLink guildId={guild.id} className="" />
          </span>
        </div>
      ) : null}

      <RequestsPanel guildId={guild.id} kinds={["post_role_menu"]} query={query} />

      <FormPanel
        id="new"
        title="New role menu"
        hint={
          full
            ? `${limit} of ${limit} menus used${plan === "pro" ? "" : `. Pro runs ${MENU_HARD_MAX}.`}`
            : "Start from a ready-made card, then change every word"
        }
        open={menus.length === 0 || editing === "new"}
      >
        <form action={addMenu} className="card-col">
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="preset-grid" role="radiogroup" aria-label="Start from">
            {Object.entries(ROLE_MENU_PRESETS).map(([key, p], i) => (
              <label className="preset" key={key}>
                <input type="radio" name="preset" value={key} defaultChecked={i === 0} />
                <span className="preset__body">
                  <span className="preset__name">{p.name}</span>
                  <span className="preset__title">{p.card.title}</span>
                  <span className="g-help">
                    {p.style === "dropdown" ? "Dropdown" : "Buttons"} ·{" "}
                    {p.maxPicks === 1 ? "one at a time" : "any number"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="field-row">
            <label className="g-field">
              <span>Name</span>
              <input
                className="g-input"
                name="name"
                maxLength={40}
                placeholder="Keeps the starting point's name"
              />
            </label>
          </div>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary" disabled={full}>
              {full ? `${limit} of ${limit} menus used` : "Add menu"}
            </button>
            {plan === "free" ? (
              <span className="g-help">
                Free servers run {limit} menus. Pro runs {MENU_HARD_MAX}, with your own colors,
                images and pick limits.
              </span>
            ) : null}
          </div>
        </form>
      </FormPanel>

      {menus.map((menu, index) => {
        const post = posts.find((p) => p.menuId === menu.id) ?? null;
        const paused = isPaused(index, ent);
        const facts = [
          menu.style === "dropdown" ? "Dropdown" : "Buttons",
          plural(menu.options.length, "role"),
          post ? `in #${channelName.get(post.channelId) ?? "deleted-channel"}` : "Not posted",
        ];
        return (
          <details
            className="g-card panel"
            id={menu.id}
            key={`${menu.id}-${contentKey(menu)}`}
            open={editing === menu.id}
          >
            <summary className="panel__summary">
              <span className="panel__title panel__title--lg">{menu.name}</span>
              {paused ? <span className="g-badge g-badge--caution">Paused</span> : null}
              <span className="panel__facts">
                {facts.map((f) => (
                  <span className="fact" key={f}>
                    {f}
                  </span>
                ))}
              </span>
              <span className="panel__cue" aria-hidden="true" />
            </summary>
            <div className="panel__body">
              <RoleMenuEditor
                guildId={guild.id}
                saved={menu}
                ent={ent}
                give={give}
                need={need}
                channels={channels}
                postedIn={post?.channelId ?? null}
                paused={paused}
                planHref={`/servers/${guild.id}/plan`}
                saveAction={saveMenu}
                removeAction={removeMenu}
                requestAction={requestAction}
                serverEmoji={serverEmoji}
              />
            </div>
          </details>
        );
      })}

      {menus.length ? (
        <p className="g-help">
          Every change is in{" "}
          <Link href={`/servers/${guild.id}/settings#history`}>Settings history</Link> and can be
          undone. A posted menu changes in Discord when you update it.
        </p>
      ) : null}
    </>
  );
}
