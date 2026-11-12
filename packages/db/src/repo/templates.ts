import { and, count, desc, eq } from "drizzle-orm";
import type { ServerBackup } from "../backups";
import type { Db } from "../client";
import { serverTemplates } from "../schema";
import { TEMPLATE_NAME_MAX, TEMPLATES_PER_USER } from "../server-templates";

/** A member's templates, newest first, without the layouts themselves. */
export async function listTemplates(db: Db, ownerId: string) {
  return db
    .select({
      id: serverTemplates.id,
      name: serverTemplates.name,
      sourceGuildId: serverTemplates.sourceGuildId,
      sourceGuildName: serverTemplates.sourceGuildName,
      roleCount: serverTemplates.roleCount,
      channelCount: serverTemplates.channelCount,
      createdAt: serverTemplates.createdAt,
    })
    .from(serverTemplates)
    .where(eq(serverTemplates.ownerId, ownerId))
    .orderBy(desc(serverTemplates.createdAt))
    .limit(TEMPLATES_PER_USER);
}

export async function getTemplate(db: Db, ownerId: string, id: string) {
  const [row] = await db
    .select()
    .from(serverTemplates)
    .where(and(eq(serverTemplates.ownerId, ownerId), eq(serverTemplates.id, id)));
  return row ?? null;
}

/** Save a template, or null when the member already has the most they can keep. */
export async function saveTemplate(
  db: Db,
  t: {
    ownerId: string;
    name: string;
    sourceGuildId: string;
    sourceGuildName: string;
    data: ServerBackup;
  },
) {
  return db.transaction(async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(serverTemplates)
      .where(eq(serverTemplates.ownerId, t.ownerId));
    if (n >= TEMPLATES_PER_USER) return null;
    const [row] = await tx
      .insert(serverTemplates)
      .values({
        ...t,
        name:
          t.name.trim().slice(0, TEMPLATE_NAME_MAX) ||
          t.sourceGuildName.slice(0, TEMPLATE_NAME_MAX) ||
          "Template",
        roleCount: t.data.roles.length,
        channelCount: t.data.channels.length,
      })
      .returning({ id: serverTemplates.id, name: serverTemplates.name });
    return row ?? null;
  });
}

/** The owner removes one of their templates. */
export async function deleteTemplate(db: Db, ownerId: string, id: string) {
  const rows = await db
    .delete(serverTemplates)
    .where(and(eq(serverTemplates.ownerId, ownerId), eq(serverTemplates.id, id)))
    .returning({ id: serverTemplates.id });
  return rows.length > 0;
}
