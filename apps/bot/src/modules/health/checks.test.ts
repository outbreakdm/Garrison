import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { ALL_REQUIRED, fixPermissionsUrl, type HealthInput, runHealthChecks } from "./checks.js";

const healthy: HealthInput = {
  everyoneId: "g",
  botPermissions: ALL_REQUIRED,
  botTop: 10,
  roles: [
    { id: "g", position: 0, managed: false, permissions: PermissionFlagsBits.SendMessages },
    { id: "mods", position: 5, managed: false, permissions: PermissionFlagsBits.BanMembers },
    { id: "verified", position: 2, managed: false, permissions: 0n },
  ],
  logChannelId: "log",
  logChannel: { exists: true, canPost: true },
  alertChannelId: null,
  alertChannel: null,
  verifyRoleId: "verified",
  staffRoleIds: ["mods"],
  antiRaidEnabled: true,
  antiNukeEnabled: true,
};

const statuses = (h: HealthInput) => runHealthChecks(h).map((c) => c.status);

describe("runHealthChecks", () => {
  it("is all OK for a well set-up server", () => {
    expect(statuses(healthy).every((s) => s === "ok")).toBe(true);
  });

  it("only warns when Change Nickname is missing: one dashboard feature needs it", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: ALL_REQUIRED & ~PermissionFlagsBits.ChangeNickname,
    });
    const profile = checks.find((c) => c.key === "perm:Profile");
    expect(profile?.status).toBe("warn");
    expect(checks.some((c) => c.status === "fix")).toBe(false);
  });

  it("names missing permissions per module", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: ALL_REQUIRED & ~PermissionFlagsBits.ViewAuditLog,
    });
    expect(checks[0]).toEqual({
      status: "fix",
      key: "perm:Security",
      title: "Security is missing permissions",
      text: "Garrison needs View Audit Log for lockdowns, verification, pausing invites and anti-nuke.",
      fix: { to: "permissions", action: "Give the permissions" },
    });
  });

  it("warns when Garrison has Administrator", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: PermissionFlagsBits.Administrator,
    });
    expect(checks.some((c) => c.status === "warn" && c.key === "administrator")).toBe(true);
    expect(checks.some((c) => c.key.startsWith("perm:"))).toBe(false);
  });

  it("flags powerful roles above Garrison, ignoring harmless and integration roles", () => {
    const roles = [
      ...healthy.roles,
      {
        id: "admins",
        position: 12,
        managed: false,
        permissions: PermissionFlagsBits.Administrator,
      },
      { id: "cosmetic", position: 15, managed: false, permissions: 0n },
      {
        id: "other-bot",
        position: 14,
        managed: true,
        permissions: PermissionFlagsBits.Administrator,
      },
    ];
    const fix = runHealthChecks({ ...healthy, roles }).find((c) => c.status === "fix");
    expect(fix?.title).toBe("A role with moderation powers sits above Garrison");
    expect(fix?.text).toContain("<@&admins>");
    expect(fix?.text).not.toContain("<@&cosmetic>");
  });

  it("catches broken channels and roles, and protections turned off", () => {
    const checks = runHealthChecks({
      ...healthy,
      logChannel: { exists: true, canPost: false },
      verifyRoleId: "gone",
      staffRoleIds: ["mods", "gone"],
      antiNukeEnabled: false,
    });
    expect(checks.map((c) => c.status).slice(0, 2)).toEqual(["fix", "fix"]);
    expect(checks.filter((c) => c.status === "warn")).toHaveLength(2);
  });

  it("asks for a log channel when none is set, fixed on the dashboard", () => {
    const checks = runHealthChecks({ ...healthy, logChannelId: null, logChannel: null });
    expect(checks.find((c) => c.status === "warn")).toMatchObject({
      key: "log-channel",
      fix: { to: "/watch#settings", action: "Pick a log channel" },
    });
  });

  it("says where every problem is fixed, and never sends anyone to a slash command", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: ALL_REQUIRED & ~PermissionFlagsBits.MoveMembers,
      logChannel: { exists: false, canPost: false },
      verifyRoleId: "gone",
      staffRoleIds: ["gone"],
      antiRaidEnabled: false,
      antiNukeEnabled: false,
    });
    for (const c of checks) {
      expect(c.text).not.toMatch(/(^|\s)\/[a-z]/);
      if (c.status !== "ok") expect(c.fix?.action).toBeTruthy();
    }
  });
});

describe("fixPermissionsUrl", () => {
  it("requests exactly the permissions Garrison uses, never Administrator", () => {
    const url = new URL(fixPermissionsUrl("123", "456"));
    const perms = BigInt(url.searchParams.get("permissions") ?? "0");
    expect(perms).toBe(ALL_REQUIRED);
    expect(perms & PermissionFlagsBits.Administrator).toBe(0n);
    expect(url.searchParams.get("guild_id")).toBe("456");
  });
});

describe("invite permissions", () => {
  it("match exactly what /health checks, so the website's invite button is right", async () => {
    const { inviteSettings } = await import("@garrison/brand");
    expect(inviteSettings.permissions).toBe(ALL_REQUIRED);
  });
});
