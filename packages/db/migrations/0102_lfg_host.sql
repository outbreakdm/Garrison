-- Group (LFG) host controls: the host (or a moderator) can lock a group so nobody new joins,
-- hand it to a member, and ping the group once every 10 minutes. Removing someone needs no
-- new columns.
ALTER TABLE "lfg_posts" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD COLUMN "pinged_at" timestamp with time zone;
--> statement-breakpoint
GRANT UPDATE (locked, host_id, pinged_at) ON public.lfg_posts TO garrison_bot;
