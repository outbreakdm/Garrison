ALTER TYPE "public"."settings_module" ADD VALUE 'utilities';--> statement-breakpoint
CREATE TABLE "member_role_snapshots" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_ids" text[] NOT NULL,
	"left_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_role_snapshots_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_role_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sticky_posts" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sticky_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timed_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"given_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timed_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "utility_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"restore_roles" boolean DEFAULT false NOT NULL,
	"restore_skip_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"stickies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clearing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utility_lists" CHECK (jsonb_typeof("utility_settings"."stickies") = 'array' AND jsonb_array_length("utility_settings"."stickies") <= 10 AND jsonb_typeof("utility_settings"."clearing") = 'array' AND jsonb_array_length("utility_settings"."clearing") <= 10)
);
--> statement-breakpoint
ALTER TABLE "utility_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_role_snapshots" ADD CONSTRAINT "member_role_snapshots_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticky_posts" ADD CONSTRAINT "sticky_posts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timed_roles" ADD CONSTRAINT "timed_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_settings" ADD CONSTRAINT "utility_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_role_snapshots_left" ON "member_role_snapshots" USING btree ("left_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timed_roles_member_role" ON "timed_roles" USING btree ("guild_id","user_id","role_id");--> statement-breakpoint
CREATE INDEX "timed_roles_due" ON "timed_roles" USING btree ("expires_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the tools (with history in settings_changes)
-- and reads timed roles for its list; the bot reads the tools, keeps members' roles when they
-- leave (and deletes them when given back or after 180 days), gives and ends timed roles, and
-- remembers the sticky message it last posted in each channel.
GRANT SELECT ON public.utility_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.utility_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, restore_roles, restore_skip_role_ids, stickies, clearing, updated_at), UPDATE (restore_roles, restore_skip_role_ids, stickies, clearing, updated_at) ON public.utility_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.utility_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.utility_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.utility_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (role_ids, left_at) ON public.member_role_snapshots TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.member_role_snapshots AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.member_role_snapshots AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.member_role_snapshots AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.member_role_snapshots AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (expires_at, given_by) ON public.timed_roles TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.timed_roles AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.timed_roles AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.timed_roles AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.timed_roles AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.timed_roles TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.timed_roles AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (message_id, posted_at) ON public.sticky_posts TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.sticky_posts AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.sticky_posts AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.sticky_posts AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.sticky_posts AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);
