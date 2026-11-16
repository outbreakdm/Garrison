/**
 * "Build me a…" from the landing page: a description that travels in the URL (?build= to the
 * server list, ?prompt= to the AI assistant) until someone sends it. It's the visitor's own
 * words about a server, never personal data, and only ever pre-fills a box they still send
 * themselves. Cleaned the same way at every hop.
 */
export const BUILD_PROMPT_MAX = 300;

export function cleanPrompt(value: unknown): string {
  if (typeof value !== "string") return "";
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strips control characters
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, BUILD_PROMPT_MAX)
  );
}

/** For the cookie that holds it: base64url, so no character needs escaping. */
export const packPrompt = (prompt: string) => Buffer.from(prompt, "utf8").toString("base64url");

/** The held description, cleaned again; "" for a missing or mangled cookie. */
export function unpackPrompt(value: string | undefined): string {
  if (!value || value.length > 1000 || !/^[\w-]+$/.test(value)) return "";
  return cleanPrompt(Buffer.from(value, "base64url").toString("utf8"));
}

/** Ready-made starting points: the landing page's wall and the chips under the box. */
export const BUILD_IDEAS: { name: string; prompt: string; channels: string[] }[] = [
  {
    name: "Raid guild",
    prompt: "A WoW raid guild with raid signups, a bench, officer chat and a rules channel",
    channels: ["raid-signups", "officer-chat", "rules"],
  },
  {
    name: "Valorant team",
    prompt: "A Valorant team with ranked and casual LFG, a scrim channel and voice rooms",
    channels: ["ranked-lfg", "scrims", "Stack 1"],
  },
  {
    name: "Study group",
    prompt: "A study group with subject channels, a homework help forum and quiet voice rooms",
    channels: ["maths", "homework-help", "Focus room"],
  },
  {
    name: "Creator community",
    prompt: "A streamer's community with go-live alerts, clips, fan art and a members area",
    channels: ["live-now", "clips", "fan-art"],
  },
  {
    name: "Minecraft server",
    prompt: "A Minecraft SMP with server status, build showcases, trading and support tickets",
    channels: ["server-status", "showcase", "trading"],
  },
  {
    name: "Book club",
    prompt: "A book club with a monthly pick, spoiler channels per book and a reading voice room",
    channels: ["monthly-pick", "spoilers", "Reading room"],
  },
  {
    name: "Esports org",
    prompt: "An esports org with team channels, staff-only planning, tryouts and announcements",
    channels: ["announcements", "tryouts", "staff-planning"],
  },
  {
    name: "Dev community",
    prompt: "A developer community with help channels, show and tell, job posts and code reviews",
    channels: ["help", "show-and-tell", "jobs"],
  },
];
