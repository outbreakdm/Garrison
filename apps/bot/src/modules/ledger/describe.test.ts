import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { describeAudit } from "./describe.js";

const base = { executorId: "taner", targetId: "kel", changes: [], reason: null, extra: null };

describe("describeAudit", () => {
  it("summarises role changes by name", () => {
    const d = describeAudit({
      ...base,
      action: AuditLogEvent.MemberRoleUpdate,
      changes: [
        {
          key: "$add",
          new: [
            { id: "1", name: "Raider" },
            { id: "2", name: "Tank" },
          ],
        },
        { key: "$remove", new: [{ id: "3", name: "Recruit" }] },
      ],
    });
    expect(d).toMatchObject({
      type: "member_roles",
      summary: "Added Raider, Tank; Removed Recruit",
      actorId: "taner",
      targetId: "kel",
    });
  });

  it("spells out permission changes on roles", () => {
    const d = describeAudit({
      ...base,
      action: AuditLogEvent.RoleUpdate,
      changes: [{ key: "permissions", old: "0", new: String(PermissionFlagsBits.Administrator) }],
    });
    expect(d?.summary).toBe("Permissions: gave Administrator");
  });

  it("reads timeouts and nicknames", () => {
    expect(
      describeAudit({
        ...base,
        action: AuditLogEvent.MemberUpdate,
        changes: [{ key: "communication_disabled_until", new: "2026-11-06T21:00:00Z" }],
      })?.summary,
    ).toBe("Timed out until 2026-11-06 21:00 UTC");
    expect(
      describeAudit({
        ...base,
        action: AuditLogEvent.MemberUpdate,
        changes: [{ key: "nick", old: null, new: "Kel" }],
      })?.summary,
    ).toBe("Nickname none → Kel");
    expect(
      describeAudit({
        ...base,
        action: AuditLogEvent.MemberUpdate,
        changes: [{ key: "avatar", new: "x" }],
      }),
    ).toBeNull();
  });

  it("keeps the reason, capped, and never message content", () => {
    const d = describeAudit({
      ...base,
      action: AuditLogEvent.MemberBanAdd,
      reason: "x".repeat(500),
    });
    expect(d?.data).toEqual({ reason: "x".repeat(300) });
    const del = describeAudit({
      ...base,
      action: AuditLogEvent.MessageDelete,
      extra: { channelId: "c", count: 3 },
    });
    expect(del).toMatchObject({
      type: "message_delete_by_mod",
      summary: "Deleted 3 messages by someone else",
      channelId: "c",
    });
  });

  it("ignores actions it doesn't log", () => {
    expect(describeAudit({ ...base, action: AuditLogEvent.StickerCreate })).toBeNull();
  });
});
