ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'post_application_panel';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'application_decide';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE 'applications';--> statement-breakpoint
CREATE TABLE "application_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_forms_list" CHECK (jsonb_typeof("application_settings"."forms") = 'array' AND jsonb_array_length("application_settings"."forms") <= 10)
);
--> statement-breakpoint
ALTER TABLE "application_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"form_id" text NOT NULL,
	"form_name" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"decided_by" text,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "applications_status" CHECK ("applications"."status" IN ('waiting', 'accepted', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_guild" ON "applications" USING btree ("guild_id","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the forms (with history in settings_changes)
-- and reads applications for the review list; the bot reads the forms, and records applications
-- and the decision on them (from the card or a dashboard request), and prunes them after 90 days.
GRANT SELECT ON public.application_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.application_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, forms, updated_at), UPDATE (forms, updated_at) ON public.application_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.application_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.application_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.application_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (status, decided_by, decided_at, channel_id, message_id) ON public.applications TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.applications AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.applications AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.applications AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.applications AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.applications TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.applications AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
