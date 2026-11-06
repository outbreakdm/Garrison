CREATE TYPE "public"."qm_status" AS ENUM('pending', 'applied', 'cancelled', 'expired', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "qm_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"version" integer NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_tag" text NOT NULL,
	"prompt" text NOT NULL,
	"summary" text NOT NULL,
	"plan" jsonb NOT NULL,
	"model" text NOT NULL,
	"status" "qm_status" DEFAULT 'pending' NOT NULL,
	"created" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"rolled_back_by_id" text
);
--> statement-breakpoint
ALTER TABLE "qm_builds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qm_builds" ADD CONSTRAINT "qm_builds_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qm_builds_guild_version" ON "qm_builds" USING btree ("guild_id","version");--> statement-breakpoint
CREATE INDEX "qm_builds_guild_created" ON "qm_builds" USING btree ("guild_id","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md checklist). The bot stores plans and moves
-- them through states; it can't rewrite a plan, its prompt or who asked.
GRANT SELECT, INSERT ON public.qm_builds TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (status, created, error, applied_at, rolled_back_at, rolled_back_by_id) ON public.qm_builds TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.qm_builds AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.qm_builds TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.qm_builds AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
