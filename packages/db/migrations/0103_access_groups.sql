-- Access groups: managers give named groups of people and roles None, View or Edit per dashboard
-- area, plus switches for manager-only requests (src/access.ts). Saved with the grants through
-- applySettingsChange ("access"), so in Settings history with undo. Free 2 groups, Pro 15.
ALTER TABLE "dashboard_access" ADD COLUMN "groups" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_access" ADD CONSTRAINT "access_groups_list" CHECK (jsonb_typeof("dashboard_access"."groups") = 'array' AND jsonb_array_length("dashboard_access"."groups") <= 15);
--> statement-breakpoint
GRANT INSERT (groups), UPDATE (groups) ON public.dashboard_access TO garrison_web;
