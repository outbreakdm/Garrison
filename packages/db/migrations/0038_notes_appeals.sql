CREATE TYPE "public"."appeal_status" AS ENUM('open', 'accepted', 'denied');--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"case_number" integer,
	"body" text NOT NULL,
	"status" "appeal_status" DEFAULT 'open' NOT NULL,
	"response" text,
	"reviewer_id" text,
	"reviewer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "appeals_body" CHECK (length("appeals"."body") BETWEEN 20 AND 2000),
	CONSTRAINT "appeals_response" CHECK ("appeals"."response" IS NULL OR length("appeals"."response") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "appeals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	CONSTRAINT "member_notes_length" CHECK (length("member_notes"."body") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "member_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watch_settings" ADD COLUMN "appeals_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeals_guild_status" ON "appeals" USING btree ("guild_id","status","created_at");--> statement-breakpoint
CREATE INDEX "appeals_user" ON "appeals" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "member_notes_guild_user" ON "member_notes" USING btree ("guild_id","user_id","id");--> statement-breakpoint
-- Least privilege (SECURITY.md). Notes: the dashboard and the bot (/note) add and
-- read them; only the dashboard marks one removed. Appeals: written on the public
-- appeal page and decided on the dashboard, both through garrison_web; the bot
-- never touches them.
GRANT UPDATE (appeals_enabled) ON public.watch_settings TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT (id, guild_id, user_id, author_id, author_name, body, created_at, removed_at, removed_by) ON public.member_notes TO garrison_web;--> statement-breakpoint
GRANT UPDATE (removed_at, removed_by) ON public.member_notes TO garrison_web;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.member_notes_id_seq TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_notes AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.member_notes AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.member_notes AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.member_notes TO garrison_bot;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.member_notes_id_seq TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.member_notes AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.member_notes AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT (id, guild_id, user_id, username, case_number, body, status, response, reviewer_id, reviewer_name, created_at, decided_at) ON public.appeals TO garrison_web;--> statement-breakpoint
GRANT UPDATE (status, response, reviewer_id, reviewer_name, decided_at) ON public.appeals TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.appeals AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.appeals AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.appeals AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);