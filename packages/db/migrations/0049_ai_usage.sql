CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"feature" text NOT NULL,
	"requested_by" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reserved_micros" integer NOT NULL,
	"cost_micros" integer,
	"ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_guild_day" ON "ai_usage" USING btree ("guild_id","feature","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_day" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the bot records AI calls; it can fill in a
-- call's result but never change who asked or what was reserved. The dashboard
-- reads them to show a server's credits for the day.
GRANT SELECT, INSERT ON public.ai_usage TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (model, input_tokens, output_tokens, cost_micros, ok) ON public.ai_usage TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.ai_usage AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.ai_usage AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.ai_usage AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.ai_usage TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ai_usage AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
