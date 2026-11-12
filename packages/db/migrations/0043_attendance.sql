ALTER TABLE "lfg_members" ADD COLUMN "attended" boolean;--> statement-breakpoint
ALTER TABLE "ops_settings" ADD COLUMN "track_attendance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD COLUMN "attended" boolean;--> statement-breakpoint
-- The bot marks attendance from voice; the dashboard turns tracking on and corrects raid marks.
GRANT UPDATE (attended) ON public.ops_signups TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (attended) ON public.lfg_members TO garrison_bot;--> statement-breakpoint
GRANT INSERT (track_attendance) ON public.ops_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (track_attendance) ON public.ops_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (attended) ON public.ops_signups TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ops_signups AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
