import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { type RoleMenuPost, roleMenuPosts, roleMenuSettings } from "../schema";

/** The stored menu list, unchecked. Run it through readRoleMenus or checkRoleMenus. */
export async function getRoleMenus(db: Db, guildId: string): Promise<unknown[]> {
  const [row] = await db
    .select({ menus: roleMenuSettings.menus })
    .from(roleMenuSettings)
    .where(eq(roleMenuSettings.guildId, guildId));
  return Array.isArray(row?.menus) ? row.menus : [];
}

export async function listRoleMenuPosts(db: Db, guildId: string): Promise<RoleMenuPost[]> {
  return db.select().from(roleMenuPosts).where(eq(roleMenuPosts.guildId, guildId));
}

export async function getRoleMenuPost(
  db: Db,
  guildId: string,
  menuId: string,
): Promise<RoleMenuPost | null> {
  const [row] = await db
    .select()
    .from(roleMenuPosts)
    .where(and(eq(roleMenuPosts.guildId, guildId), eq(roleMenuPosts.menuId, menuId)));
  return row ?? null;
}

/** Bot side: remember the message a menu was posted as, replacing any earlier one. */
export async function recordRoleMenuPost(
  db: Db,
  post: { guildId: string; menuId: string; channelId: string; messageId: string },
  now = new Date(),
) {
  await db
    .insert(roleMenuPosts)
    .values({ ...post, postedAt: now })
    .onConflictDoUpdate({
      target: [roleMenuPosts.guildId, roleMenuPosts.menuId],
      set: { channelId: post.channelId, messageId: post.messageId, postedAt: now },
    });
}
