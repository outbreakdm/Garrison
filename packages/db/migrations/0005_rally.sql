CREATE TYPE "public"."lfg_status" AS ENUM('open', 'full', 'closed', 'expired');--> statement-breakpoint
CREATE TABLE "lfg_members" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"slot_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "lfg_members_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "lfg_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lfg_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"host_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"slots" jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "lfg_status" DEFAULT 'open' NOT NULL,
	"voice_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lfg_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lfg_members" ADD CONSTRAINT "lfg_members_post_id_lfg_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."lfg_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD CONSTRAINT "lfg_posts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lfg_posts_guild_status" ON "lfg_posts" USING btree ("guild_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lfg_posts_one_open_per_host" ON "lfg_posts" USING btree ("guild_id","host_id") WHERE "lfg_posts"."status" in ('open', 'full');--> statement-breakpoint
-- Least privilege (SECURITY.md checklist). Posts change status and record
-- their card and voice channel; memberships are never deleted, only left.
GRANT SELECT, INSERT ON public.lfg_posts TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (message_id, status, voice_channel_id, closed_at) ON public.lfg_posts TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.lfg_members TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (slot_name, left_at, joined_at) ON public.lfg_members TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.lfg_posts AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.lfg_members AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
