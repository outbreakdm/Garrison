ALTER TABLE "ai_usage" ADD COLUMN "bundle_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_bundle_id_plan_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."plan_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_bundle" ON "ai_usage" USING btree ("bundle_id","created_at");--> statement-breakpoint
-- Monthly pools: an Agency plan's servers share one pool that renews with its billing
-- period, so the bot reads which plan a server's seat is in and when that period ends.
GRANT SELECT (id, current_period_end) ON public.plan_bundles TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.plan_bundles AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);
