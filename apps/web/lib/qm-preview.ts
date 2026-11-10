import type { QmOperation, QmStatus } from "@garrison/db";
import type { LayoutChannel, ServerLayout } from "./discord";

/**
 * The server as it would look after a Quartermaster plan is built: today's
 * categories, channels and roles with the plan's additions slotted in where
 * Discord will put them. Pure, so it's unit tested. A plan only ever adds.
 */

export interface PreviewChannel {
  key: string;
  name: string;
  kind: LayoutChannel["kind"];
  locked: boolean;
  isNew: boolean;
  /** What's worth knowing about a new channel: who sees it, topic, limits. */
  details: string[];
}
export interface PreviewCategory {
  key: string;
  name: string;
  isNew: boolean;
  /** An existing category the plan adds channels to. */
  touched: boolean;
  channels: PreviewChannel[];
}
export interface PreviewRole {
  key: string;
  name: string;
  color: number;
  isNew: boolean;
  details: string[];
}
export interface ServerPreview {
  loose: PreviewChannel[];
  categories: PreviewCategory[];
  roles: PreviewRole[];
  added: { categories: number; channels: number; roles: number };
}

const existing = (c: LayoutChannel): PreviewChannel => ({
  key: c.id,
  name: c.name,
  kind: c.kind,
  locked: c.locked,
  isNew: false,
  details: [],
});

const isChannel = (o: QmOperation) =>
  o.kind === "create_text_channel" || o.kind === "create_voice_channel";

export function previewServer(layout: ServerLayout, plan: QmOperation[]): ServerPreview {
  const roleName = new Map<string, string>([
    ...layout.roles.map((r) => [r.id, r.name] as [string, string]),
    ...plan.filter((o) => o.kind === "create_role").map((o) => [o.ref, o.name] as [string, string]),
  ]);
  const made = (o: QmOperation): PreviewChannel => {
    const details: string[] = [];
    if (o.privateTo.length)
      details.push(`Only ${o.privateTo.map((r) => `@${roleName.get(r) ?? "?"}`).join(", ")}`);
    if (o.topic) details.push(o.topic);
    if (o.slowmodeSeconds) details.push(`Slowmode ${o.slowmodeSeconds} s`);
    if (o.userLimit) details.push(`Limit ${o.userLimit}`);
    return {
      key: `new:${o.ref}`,
      name: o.name,
      kind: o.kind === "create_voice_channel" ? "voice" : "text",
      locked: o.privateTo.length > 0,
      isNew: true,
      details,
    };
  };
  const channels = plan.filter(isChannel);
  const newCategories = plan.filter((o) => o.kind === "create_category");
  const homes = new Set([
    ...layout.categories.map((c) => c.id),
    ...newCategories.map((o) => o.ref),
  ]);
  const into = (parent: string) => channels.filter((o) => o.parent === parent).map(made);
  // Discord lists text channels above voice ones, so a new text channel lands above the voice rooms.
  const voiceLast = (list: PreviewChannel[]) => [
    ...list.filter((c) => c.kind !== "voice"),
    ...list.filter((c) => c.kind === "voice"),
  ];

  return {
    // A channel with no category, or whose category has since gone, sits at the top.
    loose: voiceLast([
      ...layout.loose.map(existing),
      ...channels.filter((o) => !o.parent || !homes.has(o.parent)).map(made),
    ]),
    categories: [
      ...layout.categories.map((c) => {
        const added = into(c.id);
        return {
          key: c.id,
          name: c.name,
          isNew: false,
          touched: added.length > 0,
          channels: voiceLast([...c.channels.map(existing), ...added]),
        };
      }),
      // Discord puts new categories at the bottom.
      ...newCategories.map((o) => ({
        key: `new:${o.ref}`,
        name: o.name,
        isNew: true,
        touched: true,
        channels: voiceLast(into(o.ref)),
      })),
    ],
    roles: [
      ...layout.roles.map((r) => ({
        key: r.id,
        name: r.name,
        color: r.color,
        isNew: false,
        details: r.managed ? ["Managed by an app"] : [],
      })),
      // New roles start at the bottom, with no permissions.
      ...plan
        .filter((o) => o.kind === "create_role")
        .map((o) => ({
          key: `new:${o.ref}`,
          name: o.name,
          color: o.color ?? 0,
          isNew: true,
          details: [
            "No permissions",
            ...(o.hoist ? ["Shown separately"] : []),
            ...(o.mentionable ? ["Anyone can mention"] : []),
          ],
        })),
    ],
    added: {
      categories: newCategories.length,
      channels: channels.length,
      roles: plan.filter((o) => o.kind === "create_role").length,
    },
  };
}

/** "2 categories, 5 channels and 1 role", leaving out what the plan doesn't add. */
export function addedText(added: ServerPreview["added"]) {
  const parts = [
    added.categories
      ? `${added.categories} ${added.categories === 1 ? "category" : "categories"}`
      : "",
    added.channels ? `${added.channels} ${added.channels === 1 ? "channel" : "channels"}` : "",
    added.roles ? `${added.roles} ${added.roles === 1 ? "role" : "roles"}` : "",
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** One line per change, for a build's history entry. */
export function planLines(plan: QmOperation[]) {
  const names = new Map(plan.map((o) => [o.ref, o.name]));
  return plan.map((o) => {
    const where = o.parent && names.has(o.parent) ? ` in ${names.get(o.parent)}` : "";
    const lock = o.privateTo.length ? " · private" : "";
    switch (o.kind) {
      case "create_category":
        return `+ Category ${o.name}`;
      case "create_text_channel":
        return `+ #${o.name}${where}${lock}`;
      case "create_voice_channel":
        return `+ Voice ${o.name}${where}${lock}`;
      default:
        return `+ Role @${o.name} · no permissions`;
    }
  });
}

/** A build's state in plain words, with the badge tone it's shown in. */
export const BUILD_STATUS: Record<QmStatus, { label: string; tone: string }> = {
  pending: { label: "Not built", tone: "g-badge--intel" },
  applied: { label: "Built", tone: "g-badge--go" },
  cancelled: { label: "Discarded", tone: "" },
  expired: { label: "Expired", tone: "" },
  failed: { label: "Stopped partway", tone: "g-badge--alert" },
  rolled_back: { label: "Undone", tone: "g-badge--caution" },
};
