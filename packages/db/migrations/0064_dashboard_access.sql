ALTER TYPE "public"."settings_module" ADD VALUE 'access';--> statement-breakpoint
CREATE TABLE "dashboard_access" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_list" CHECK (jsonb_typeof("dashboard_access"."grants") = 'array' AND jsonb_array_length("dashboard_access"."grants") <= 25)
);
--> statement-breakpoint
ALTER TABLE "dashboard_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD COLUMN "member_guild_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_access" ADD CONSTRAINT "dashboard_access_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_access_grants" ON "dashboard_access" USING gin ("grants");--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the dashboard writes who else may use it (with history
-- in settings_changes). The bot only reads it, to re-check an editor's dashboard requests.
GRANT SELECT ON public.dashboard_access TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.dashboard_access AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, grants, updated_at) ON public.dashboard_access TO garrison_web;--> statement-breakpoint
GRANT UPDATE (grants, updated_at) ON public.dashboard_access TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.dashboard_access AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.dashboard_access AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.dashboard_access AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
