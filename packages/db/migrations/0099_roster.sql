-- The raid roster: teams (Free 1, Pro more), who is on each and where they stand (Core, Trial,
-- Bench, Social, and a note only officers see), and members' characters (a main and alts). The
-- dashboard edits all of it; members add their own characters with /roster or the member page.
CREATE TABLE "roster_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"class_name" text,
	"spec" text,
	"role" text,
	"main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_characters_name" CHECK (length("roster_characters"."name") BETWEEN 1 AND 32),
	CONSTRAINT "roster_characters_fields" CHECK (coalesce(length("roster_characters"."class_name"), 0) <= 24 AND coalesce(length("roster_characters"."spec"), 0) <= 24 AND coalesce(length("roster_characters"."role"), 0) <= 20)
);
--> statement-breakpoint
ALTER TABLE "roster_characters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roster_members" (
	"team_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'core' NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "roster_members_status" CHECK ("roster_members"."status" IN ('core', 'trial', 'bench', 'social')),
	CONSTRAINT "roster_members_note" CHECK ("roster_members"."note" IS NULL OR length("roster_members"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "roster_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roster_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"game" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_teams_name" CHECK (length("roster_teams"."name") BETWEEN 1 AND 32)
);
--> statement-breakpoint
ALTER TABLE "roster_teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roster_characters" ADD CONSTRAINT "roster_characters_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_members" ADD CONSTRAINT "roster_members_team_id_roster_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."roster_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_members" ADD CONSTRAINT "roster_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_teams" ADD CONSTRAINT "roster_teams_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roster_characters_member" ON "roster_characters" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_characters_one_main" ON "roster_characters" USING btree ("guild_id","user_id") WHERE "roster_characters"."main";--> statement-breakpoint
CREATE INDEX "roster_members_member" ON "roster_members" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "roster_teams_guild" ON "roster_teams" USING btree ("guild_id");--> statement-breakpoint
-- The dashboard edits teams, members and characters (officers), and members' own characters (the
-- member page). The bot reads teams and members, and edits members' own characters (/roster).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_teams TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_members TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_characters TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.roster_teams AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.roster_members AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.roster_characters AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.roster_teams TO garrison_bot;--> statement-breakpoint
GRANT SELECT ON public.roster_members TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_characters TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.roster_teams AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.roster_members AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.roster_characters AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
