CREATE TYPE "public"."plan_source" AS ENUM('stripe', 'comp');--> statement-breakpoint
CREATE TABLE "platform_staff" (
	"user_id" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "source" "plan_source" DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "granted_by" text;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "note" text;--> statement-breakpoint
-- Staff are added by the database owner only, e.g.
--   INSERT INTO platform_staff (user_id) VALUES ('<your Discord user ID>');
-- The dashboard reads the list to show the staff page; nothing can write it.
GRANT SELECT ON public.platform_staff TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.platform_staff AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
-- Give or remove complimentary Pro. Runs as the owner, refuses anyone not in
-- platform_staff, and never touches a plan someone pays for through Stripe.
-- Returns what the server ends up on: 'comp', 'paid' or 'free'.
CREATE OR REPLACE FUNCTION public.plan_set_comp(actor text, guild text, comp boolean, why text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE current_row public.guild_plans%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = actor) THEN
    RAISE EXCEPTION 'plan_set_comp: % is not staff', actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO current_row FROM public.guild_plans p WHERE p.guild_id = guild;
  IF FOUND AND current_row.source = 'stripe' AND current_row.plan = 'pro' THEN
    RETURN 'paid';
  END IF;
  IF comp THEN
    INSERT INTO public.guild_plans (guild_id, plan, source, granted_by, note, updated_at)
    VALUES (guild, 'pro', 'comp', actor, left(nullif(trim(why), ''), 200), now())
    ON CONFLICT (guild_id) DO UPDATE SET plan = 'pro', source = 'comp',
      granted_by = EXCLUDED.granted_by, note = EXCLUDED.note, updated_at = now();
    RETURN 'comp';
  END IF;
  DELETE FROM public.guild_plans p WHERE p.guild_id = guild AND p.source = 'comp';
  RETURN 'free';
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_set_comp(text, text, boolean, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.plan_set_comp(text, text, boolean, text) TO garrison_web;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.plan_set_comp(text, text, boolean, text) FROM anon, authenticated';
  END IF;
END
$$;
