ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'template_save';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'template_apply';--> statement-breakpoint
CREATE TABLE "server_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"source_guild_id" text NOT NULL,
	"source_guild_name" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"role_count" integer DEFAULT 0 NOT NULL,
	"channel_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "server_templates_owner" ON "server_templates" USING btree ("owner_id","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the bot saves templates and reads their layouts
-- (asked through dashboard_actions); the dashboard lists a member's own templates
-- without the layout and lets them delete one.
GRANT SELECT, INSERT ON public.server_templates TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.server_templates AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT (id, owner_id, name, source_guild_id, source_guild_name, role_count, channel_count, created_at), DELETE ON public.server_templates TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.server_templates AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_delete" ON public.server_templates AS PERMISSIVE FOR DELETE TO garrison_web USING (true);
