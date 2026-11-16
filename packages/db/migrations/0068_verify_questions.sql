ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'verify_decide';--> statement-breakpoint
CREATE TABLE "verify_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "verify_answers_status" CHECK ("verify_answers"."status" IN ('waiting', 'verified', 'approved', 'denied'))
);
--> statement-breakpoint
ALTER TABLE "verify_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "verify_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "verify_intro" text;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "verify_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "verify_answers_channel_id" text;--> statement-breakpoint
ALTER TABLE "verify_answers" ADD CONSTRAINT "verify_answers_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verify_answers_guild" ON "verify_answers" USING btree ("guild_id","created_at");--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD CONSTRAINT "gatehouse_verify_questions" CHECK (jsonb_typeof("gatehouse_settings"."verify_questions") = 'array' AND jsonb_array_length("gatehouse_settings"."verify_questions") <= 5);--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the questions (history in
-- settings_changes); the bot already reads and writes gatehouse_settings whole. Answers are
-- the bot's to write (from the form, the website request and the decision buttons); the
-- dashboard only reads them, and asks the bot to decide through a dashboard request.
GRANT UPDATE (verify_questions, verify_intro, verify_review, verify_answers_channel_id) ON public.gatehouse_settings TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (status, decided_by, decided_at, channel_id, message_id) ON public.verify_answers TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.verify_answers AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.verify_answers AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.verify_answers AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.verify_answers AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.verify_answers TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.verify_answers AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
