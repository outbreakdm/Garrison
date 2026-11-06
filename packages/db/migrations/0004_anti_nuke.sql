CREATE TABLE "quarantines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_tag" text NOT NULL,
	"reason" text NOT NULL,
	"removed_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"kicked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp with time zone,
	"restored_by_id" text
);
--> statement-breakpoint
ALTER TABLE "quarantines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "anti_nuke_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "anti_nuke_trusted_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "nuke_delete_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "nuke_ban_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "nuke_window_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "quarantines" ADD CONSTRAINT "quarantines_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quarantines_guild_user" ON "quarantines" USING btree ("guild_id","user_id");--> statement-breakpoint
-- Least privilege for the new table (SECURITY.md checklist). The bot records
-- quarantines and marks them restored; it never edits or deletes them.
GRANT SELECT, INSERT ON public.quarantines TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (restored_at, restored_by_id) ON public.quarantines TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.quarantines AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
