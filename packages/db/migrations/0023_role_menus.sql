ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_role_menu';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'bot_profile';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'roles';--> statement-breakpoint
CREATE TABLE "role_menu_posts" (
	"guild_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_menu_posts_guild_id_menu_id_pk" PRIMARY KEY("guild_id","menu_id")
);
--> statement-breakpoint
ALTER TABLE "role_menu_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_menu_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"menus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_menus_list" CHECK (jsonb_typeof("role_menu_settings"."menus") = 'array' AND jsonb_array_length("role_menu_settings"."menus") <= 25)
);
--> statement-breakpoint
ALTER TABLE "role_menu_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_menu_posts" ADD CONSTRAINT "role_menu_posts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_settings" ADD CONSTRAINT "role_menu_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits menus (with history in
-- settings_changes); the bot only reads them. The bot records where each menu is
-- posted; the dashboard only reads that.
GRANT SELECT ON public.role_menu_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.role_menu_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, menus, updated_at) ON public.role_menu_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (menus, updated_at) ON public.role_menu_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.role_menu_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.role_menu_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.role_menu_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (channel_id, message_id, posted_at) ON public.role_menu_posts TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.role_menu_posts AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.role_menu_posts AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.role_menu_posts AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.role_menu_posts TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.role_menu_posts AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
