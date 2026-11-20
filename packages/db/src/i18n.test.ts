import { describe, expect, it } from "vitest";
import { alertButton, alertHeading } from "./alerts";
import { COMMAND_DESCRIPTIONS, commandLocalizations, isLanguage, LANGUAGE_LIST, say } from "./i18n";

describe("other languages", () => {
  it("fills a phrase's holes, and leaves an unknown hole as it is", () => {
    expect(say("es", "levelUp", { user: "<@1>", level: 5 })).toBe("<@1> subió al nivel 5.");
    expect(say("de", "levelUpRoles", { user: "<@1>", level: 5, roles: "<@&2>" })).toBe(
      "<@1> hat Level 5 erreicht und <@&2> bekommen.",
    );
    expect(say("fr", "level", {})).toBe("Niveau {level}");
  });

  it("writes alert headings and buttons in the server's language", () => {
    expect(alertHeading("twitch", "shroud")).toBe("shroud is live on Twitch");
    expect(alertHeading("twitch", "shroud", "pt")).toBe("shroud está ao vivo na Twitch");
    expect(alertHeading("reddit", "valorant", "fr")).toBe("Nouveau post dans r/valorant");
    expect(alertButton("youtube", "es")).toBe("Ver en YouTube");
    expect(alertButton("rss", "de")).toBe("Lesen");
  });

  it("keeps every command description inside Discord's 100 characters, in every locale", () => {
    for (const [name, d] of Object.entries(COMMAND_DESCRIPTIONS)) {
      const localized = commandLocalizations(name) ?? {};
      expect(Object.keys(localized).sort()).toEqual(["de", "es-419", "es-ES", "fr", "pt-BR"]);
      for (const text of Object.values(d)) {
        expect(text.length, `${name}: ${text}`).toBeLessThanOrEqual(100);
        expect(text.trim()).toBe(text);
      }
    }
    expect(commandLocalizations("not-a-command")).toBeUndefined();
  });

  it("knows its languages", () => {
    expect(LANGUAGE_LIST).toEqual(["en", "es", "pt", "de", "fr"]);
    expect(isLanguage("pt")).toBe(true);
    expect(isLanguage("it")).toBe(false);
  });
});
