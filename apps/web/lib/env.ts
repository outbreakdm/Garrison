import "server-only";
import { z } from "zod";

const schema = z.object({
  /** Public URL of the dashboard, e.g. https://dash.garrison.gg. The OAuth redirect is APP_URL/auth/callback. */
  APP_URL: z.string().url(),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  /** Bot token, used server-side only to check a user's live permissions in a server. */
  DISCORD_TOKEN: z.string().min(1),
  /** Connection string for the garrison_web role. On Cloudflare, the Hyperdrive binding is used instead. */
  WEB_DATABASE_URL: z.string().url().optional(),
  /** Discord API base. Only for pointing tests at a local stand-in; defaults to Discord. */
  DISCORD_API_BASE: z.string().url().default("https://discord.com/api/v10"),
  /** Battle.net client for linking World of Warcraft characters. Optional: without it, WoW linking is hidden. */
  BNET_CLIENT_ID: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  BNET_CLIENT_SECRET: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server env. Read lazily so `next build` doesn't need secrets. */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Dashboard environment is incomplete: ${names}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === "production";
