ALTER TABLE "member_pages" ADD COLUMN "public_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_pages" ADD COLUMN "public_leaderboard" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_pages" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "member_pages" ADD COLUMN "public_about" text;--> statement-breakpoint
ALTER TABLE "member_pages" ADD COLUMN "public_invite" text;--> statement-breakpoint
CREATE UNIQUE INDEX "member_pages_public_slug" ON "member_pages" USING btree ("public_slug");--> statement-breakpoint
ALTER TABLE "member_pages" ADD CONSTRAINT "member_pages_public_about" CHECK (char_length("member_pages"."public_about") <= 300);--> statement-breakpoint
-- Least privilege (SECURITY.md): the dashboard edits the public page's settings (with history in
-- settings_changes) and reads them to draw the page. The bot never needs them.
GRANT INSERT (public_page, public_leaderboard, public_slug, public_about, public_invite), UPDATE (public_page, public_leaderboard, public_slug, public_about, public_invite) ON public.member_pages TO garrison_web;
