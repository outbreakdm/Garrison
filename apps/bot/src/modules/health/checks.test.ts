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

  it("names missing permissions per module", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: ALL_REQUIRED & ~PermissionFlagsBits.ViewAuditLog,
    });
    expect(checks[0]).toEqual({
      status: "fix",
      text: "Gatehouse: I'm missing View Audit Log, for lockdowns, verification, pausing invites and anti-nuke.",
    });
  });

  it("warns when Garrison has Administrator", () => {
    const checks = runHealthChecks({
      ...healthy,
      botPermissions: PermissionFlagsBits.Administrator,
    });
    expect(checks.some((c) => c.status === "warn" && c.text.includes("Administrator"))).toBe(true);
    expect(checks.some((c) => c.text.includes("missing"))).toBe(false);
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
    expect(fix?.text).toContain("A role with moderation powers sits above Garrison: <@&admins>");
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

  it("asks for a log channel when none is set", () => {
    const checks = runHealthChecks({ ...healthy, logChannelId: null, logChannel: null });
    expect(checks.find((c) => c.status === "warn")?.text).toContain("/moderation log_channel");
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
