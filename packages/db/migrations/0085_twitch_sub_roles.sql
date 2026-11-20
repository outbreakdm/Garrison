CREATE TABLE "twitch_sub_roles" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"broadcaster_id" text NOT NULL,
	"broadcaster_login" text NOT NULL,
	"role_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"connected_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitch_sub_roles_status" CHECK ("twitch_sub_roles"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "twitch_sub_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "twitch_subscribers" (
	"broadcaster_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tier" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "twitch_subscribers_broadcaster_id_user_id_pk" PRIMARY KEY("broadcaster_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "twitch_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "twitch_sub_roles" ADD CONSTRAINT "twitch_sub_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "twitch_sub_roles_broadcaster" ON "twitch_sub_roles" USING btree ("broadcaster_id");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard connects and disconnects a streamer, picks the
-- role, and keeps the subscriber list from Twitch's webhook (EventSub); the bot only reads both
-- to give and take the role.
GRANT SELECT, INSERT, DELETE, UPDATE (broadcaster_id, broadcaster_login, role_id, status, connected_by, updated_at) ON public.twitch_sub_roles TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.twitch_sub_roles AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.twitch_sub_roles AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.twitch_sub_roles AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_delete" ON public.twitch_sub_roles AS PERMISSIVE FOR DELETE TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (tier, updated_at) ON public.twitch_subscribers TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.twitch_subscribers AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.twitch_subscribers AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.twitch_subscribers AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_delete" ON public.twitch_subscribers AS PERMISSIVE FOR DELETE TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.twitch_sub_roles TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.twitch_sub_roles AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.twitch_subscribers TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.twitch_subscribers AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);
