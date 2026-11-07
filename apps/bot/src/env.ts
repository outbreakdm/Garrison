import { z } from "zod";

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().regex(/^\d+$/, "DISCORD_CLIENT_ID must be the application ID"),
  /** Register commands to one guild for instant updates while developing. */
  DISCORD_DEV_GUILD_ID: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  DATABASE_URL: z.string().url("DATABASE_URL must be a Postgres connection string"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Claude API key for Quartermaster. Without it, /qm explains that it isn't set up. */
  ANTHROPIC_API_KEY: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Serve GET /healthz on this port, for hosts that check health. Off when unset. */
  HEALTH_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Model Quartermaster plans with. */
  QM_MODEL: z.string().min(1).default("claude-opus-5-5"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      `Invalid environment. Copy .env.example to .env and fill it in.\n${problems.join("\n")}`,
    );
  }
  return parsed.data;
}
