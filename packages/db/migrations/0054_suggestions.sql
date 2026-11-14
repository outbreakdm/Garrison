ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'suggestion_status';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE 'suggestions';--> statement-breakpoint
CREATE TABLE "suggestion_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suggestion_votes" (
	"suggestion_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "suggestion_votes_suggestion_id_user_id_pk" PRIMARY KEY("suggestion_id","user_id"),
	CONSTRAINT "suggestion_votes_value" CHECK ("suggestion_votes"."value" IN (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "suggestion_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"number" integer NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"text" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"up" integer DEFAULT 0 NOT NULL,
	"down" integer DEFAULT 0 NOT NULL,
	"channel_id" text,
	"message_id" text,
	"staff_note" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_status" CHECK ("suggestions"."status" IN ('open', 'planned', 'done', 'declined')),
	CONSTRAINT "suggestions_text" CHECK (length("suggestions"."text") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD CONSTRAINT "suggestion_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suggestions_number" ON "suggestions" USING btree ("guild_id","number");--> statement-breakpoint
CREATE INDEX "suggestions_recent" ON "suggestions" USING btree ("guild_id","status","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the settings (history in
-- settings_changes) and reads suggestions; status changes go through the request queue,
-- so the bot writes them and edits the card in the same step. The bot stores suggestions
-- and votes; the dashboard never sees who voted which way.
GRANT SELECT ON public.suggestion_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.suggestion_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, channel_id, anonymous, updated_at) ON public.suggestion_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, channel_id, anonymous, updated_at) ON public.suggestion_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.suggestion_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.suggestion_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.suggestion_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (up, down, status, staff_note, decided_by, channel_id, message_id, updated_at) ON public.suggestions TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.suggestions AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.suggestions AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.suggestions AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.suggestions TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.suggestions AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (value) ON public.suggestion_votes TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.suggestion_votes AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.suggestion_votes AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.suggestion_votes AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.suggestion_votes AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);
