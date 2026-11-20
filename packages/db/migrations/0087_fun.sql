ALTER TYPE "public"."settings_module" ADD VALUE 'fun';--> statement-breakpoint
CREATE TABLE "birthdays" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"month" smallint NOT NULL,
	"day" smallint NOT NULL,
	CONSTRAINT "birthdays_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id"),
	CONSTRAINT "birthdays_date" CHECK ("birthdays"."month" BETWEEN 1 AND 12 AND "birthdays"."day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
ALTER TABLE "birthdays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fun_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"birthdays_enabled" boolean DEFAULT false NOT NULL,
	"birthday_channel_id" text,
	"birthday_role_id" text,
	"counting_enabled" boolean DEFAULT false NOT NULL,
	"counting_channel_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fun_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fun_state" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_user_id" text,
	"best" integer DEFAULT 0 NOT NULL,
	"birthday_date" text,
	"birthday_holders" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fun_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "birthdays" ADD CONSTRAINT "birthdays_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fun_settings" ADD CONSTRAINT "fun_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fun_state" ADD CONSTRAINT "fun_state_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "birthdays_day" ON "birthdays" USING btree ("guild_id","month","day");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the fun settings (with history in
-- settings_changes) and reads birthdays and the count to show them; the bot reads the settings,
-- keeps members' birthdays (/birthday), and keeps the count and the birthday day it last ran.
GRANT SELECT ON public.fun_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.fun_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, birthdays_enabled, birthday_channel_id, birthday_role_id, counting_enabled, counting_channel_id, updated_at), UPDATE (birthdays_enabled, birthday_channel_id, birthday_role_id, counting_enabled, counting_channel_id, updated_at) ON public.fun_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.fun_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.fun_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.fun_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (month, day) ON public.birthdays TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.birthdays AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.birthdays AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.birthdays AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.birthdays AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.birthdays TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.birthdays AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (count, last_user_id, best, birthday_date, birthday_holders) ON public.fun_state TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.fun_state AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.fun_state AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.fun_state AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.fun_state TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.fun_state AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
