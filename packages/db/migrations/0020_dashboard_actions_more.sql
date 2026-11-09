ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'lockdown_start';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'lockdown_end';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'release_quarantine';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'undo_case';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'cancel_raid';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'close_lfg';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'undo_build';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'run_health';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'post_verify_panel';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'anti_nuke';