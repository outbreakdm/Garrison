CREATE TYPE "public"."link_source" AS ENUM('discord', 'battlenet', 'claimed');--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"verified" boolean NOT NULL,
	"source" "link_source" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "linked_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roster_shares" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "roster_shares_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "roster_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roster_shares" ADD CONSTRAINT "roster_shares_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_unique" ON "linked_accounts" USING btree ("user_id","provider","account_id");--> statement-breakpoint
CREATE INDEX "linked_accounts_user" ON "linked_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roster_shares_user" ON "roster_shares" USING btree ("user_id");--> statement-breakpoint
-- Least privilege (SECURITY.md checklist). Links and shares are never
-- deleted, only marked removed. The bot handles claimed (OSRS) links and
-- sharing from Discord; the dashboard handles verified links (Discord
-- Connections, Battle.net) and lets members stop sharing or remove links.
GRANT SELECT, INSERT ON public.linked_accounts TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (display_name, verified, source, details, refreshed_at, removed_at) ON public.linked_accounts TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.roster_shares TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (username, shared_at, removed_at) ON public.roster_shares TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.linked_accounts AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.roster_shares AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.linked_accounts TO garrison_web;--> statement-breakpoint
GRANT UPDATE (display_name, verified, source, details, refreshed_at, removed_at) ON public.linked_accounts TO garrison_web;--> statement-breakpoint
GRANT SELECT ON public.roster_shares TO garrison_web;--> statement-breakpoint
GRANT UPDATE (removed_at) ON public.roster_shares TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.linked_accounts AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.roster_shares AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);
