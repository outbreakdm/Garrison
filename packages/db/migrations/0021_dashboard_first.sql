ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'mod_action';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'purge';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'create_lfg';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'lfg_join';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'lfg_leave';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'raid_signup';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'raid_withdraw';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'qm_plan';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'qm_apply';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'qm_cancel';