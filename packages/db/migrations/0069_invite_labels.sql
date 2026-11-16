ALTER TYPE "public"."settings_module" ADD VALUE 'invites';--> statement-breakpoint
CREATE TABLE "invite_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_labels_list" CHECK (jsonb_typeof("invite_settings"."labels") = 'array' AND jsonb_array_length("invite_settings"."labels") <= 100)
);
--> statement-breakpoint
ALTER TABLE "invite_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invite_settings" ADD CONSTRAINT "invite_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits invite labels (history in
-- settings_changes); the bot only reads them, to give a label's role on join.
GRANT SELECT ON public.invite_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.invite_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, labels, updated_at) ON public.invite_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (labels, updated_at) ON public.invite_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.invite_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.invite_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.invite_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
