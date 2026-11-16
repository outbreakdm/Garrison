CREATE TABLE "insights_shares" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"embed" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "insights_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "insights_shares" ADD CONSTRAINT "insights_shares_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the dashboard makes, replaces and stops share links
-- (managers only, checked by the dashboard) and reads them to open a shared page. The bot
-- never needs them.
GRANT SELECT, INSERT (guild_id, token, embed, created_by, created_at), UPDATE (token, embed, created_by, created_at), DELETE ON public.insights_shares TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.insights_shares AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.insights_shares AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.insights_shares AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_delete" ON public.insights_shares AS PERMISSIVE FOR DELETE TO garrison_web USING (true);
