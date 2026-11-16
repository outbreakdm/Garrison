ALTER TYPE "public"."settings_module" ADD VALUE 'members';--> statement-breakpoint
CREATE TABLE "member_pages" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"show_you" boolean DEFAULT true NOT NULL,
	"show_record" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_pages" ADD CONSTRAINT "member_pages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the dashboard reads or writes which member pages show,
-- through Settings history. The bot never needs it.
GRANT SELECT, INSERT (guild_id, show_you, show_record, updated_at) ON public.member_pages TO garrison_web;--> statement-breakpoint
GRANT UPDATE (show_you, show_record, updated_at) ON public.member_pages TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_pages AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.member_pages AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.member_pages AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
