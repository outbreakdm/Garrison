CREATE INDEX "sticky_posts_guild" ON "sticky_posts" USING btree ("guild_id");--> statement-breakpoint
-- "Erase your data" on the Account page deletes the member's own birthdays (saved with /birthday).
GRANT DELETE ON public.birthdays TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_delete" ON public.birthdays AS PERMISSIVE FOR DELETE TO garrison_web USING (true);
