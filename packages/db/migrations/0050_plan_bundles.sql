ALTER TYPE "public"."plan_source" ADD VALUE 'bundle';--> statement-breakpoint
CREATE TABLE "plan_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"seats" integer DEFAULT 5 NOT NULL,
	"source" "plan_source" DEFAULT 'stripe' NOT NULL,
	"granted_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_bundles_seats" CHECK ("plan_bundles"."seats" BETWEEN 1 AND 25)
);
--> statement-breakpoint
ALTER TABLE "plan_bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "bundle_id" uuid;--> statement-breakpoint
CREATE INDEX "plan_bundles_owner_idx" ON "plan_bundles" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "guild_plans" ADD CONSTRAINT "guild_plans_bundle_id_plan_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."plan_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Agency plans. The dashboard reads them (filtered to the signed-in owner in code) and
-- changes them only through the functions below; the bot never needs them.
GRANT SELECT ON public.plan_bundles TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.plan_bundles AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
-- Complimentary Pro now also leaves an Agency seat alone (reported as 'paid').
CREATE OR REPLACE FUNCTION public.plan_set_comp(actor text, guild text, comp boolean, why text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE current_row public.guild_plans%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = actor) THEN
    RAISE EXCEPTION 'plan_set_comp: % is not staff', actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO current_row FROM public.guild_plans p WHERE p.guild_id = guild;
  IF FOUND AND current_row.plan = 'pro' AND current_row.source::text IN ('stripe', 'bundle') THEN
    RETURN 'paid';
  END IF;
  IF comp THEN
    INSERT INTO public.guild_plans (guild_id, plan, source, granted_by, note, updated_at)
    VALUES (guild, 'pro', 'comp', actor, left(nullif(trim(why), ''), 200), now())
    ON CONFLICT (guild_id) DO UPDATE SET plan = 'pro', source = 'comp', bundle_id = NULL,
      granted_by = EXCLUDED.granted_by, note = EXCLUDED.note, updated_at = now();
    RETURN 'comp';
  END IF;
  DELETE FROM public.guild_plans p WHERE p.guild_id = guild AND p.source = 'comp';
  RETURN 'free';
END
$$;--> statement-breakpoint
-- Staff give (or resize) a complimentary Agency plan for a Discord user. Shrinking it
-- frees the most recently filled seats first. Returns the plan's id.
CREATE OR REPLACE FUNCTION public.plan_bundle_set_comp(actor text, owner text, seat_count integer, why text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE b uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = actor) THEN
    RAISE EXCEPTION 'plan_bundle_set_comp: % is not staff', actor USING ERRCODE = '42501';
  END IF;
  IF owner !~ '^[0-9]{17,20}$' OR seat_count NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'plan_bundle_set_comp: bad owner or seat count' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO b FROM public.plan_bundles WHERE owner_id = owner AND source = 'comp' LIMIT 1;
  IF b IS NULL THEN
    INSERT INTO public.plan_bundles (owner_id, seats, source, granted_by, note)
    VALUES (owner, seat_count, 'comp', actor, left(nullif(trim(why), ''), 200))
    RETURNING id INTO b;
  ELSE
    UPDATE public.plan_bundles SET seats = seat_count, granted_by = actor,
      note = left(nullif(trim(why), ''), 200), updated_at = now() WHERE id = b;
    DELETE FROM public.guild_plans p WHERE p.bundle_id = b AND p.guild_id NOT IN (
      SELECT q.guild_id FROM public.guild_plans q WHERE q.bundle_id = b
      ORDER BY q.updated_at ASC, q.guild_id LIMIT seat_count);
  END IF;
  RETURN b;
END
$$;--> statement-breakpoint
-- Staff remove a complimentary Agency plan; its servers drop to Free (nothing deleted).
CREATE OR REPLACE FUNCTION public.plan_bundle_remove_comp(actor text, bundle uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = actor) THEN
    RAISE EXCEPTION 'plan_bundle_remove_comp: % is not staff', actor USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.plan_bundles WHERE id = bundle AND source = 'comp';
  RETURN FOUND;
END
$$;--> statement-breakpoint
-- The plan's owner puts a server into a seat. The dashboard has already checked that
-- the owner manages the server. Never past the seat count, never over a server that has
-- Pro some other way. Returns 'assigned', 'full', 'paid', 'taken' or 'not_owner'.
CREATE OR REPLACE FUNCTION public.plan_bundle_assign(actor text, bundle uuid, guild text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE b public.plan_bundles%ROWTYPE;
DECLARE current_row public.guild_plans%ROWTYPE;
DECLARE used integer;
BEGIN
  SELECT * INTO b FROM public.plan_bundles WHERE id = bundle FOR UPDATE;
  IF NOT FOUND OR b.owner_id <> actor THEN
    RETURN 'not_owner';
  END IF;
  SELECT * INTO current_row FROM public.guild_plans p WHERE p.guild_id = guild;
  IF FOUND AND current_row.plan = 'pro' THEN
    IF current_row.source::text = 'bundle' THEN
      RETURN CASE WHEN current_row.bundle_id = bundle THEN 'assigned' ELSE 'taken' END;
    END IF;
    RETURN 'paid';
  END IF;
  SELECT count(*) INTO used FROM public.guild_plans p WHERE p.bundle_id = bundle;
  IF used >= b.seats THEN
    RETURN 'full';
  END IF;
  INSERT INTO public.guild_plans (guild_id, plan, source, bundle_id, granted_by, note, updated_at)
  VALUES (guild, 'pro', 'bundle', bundle, actor, NULL, now())
  ON CONFLICT (guild_id) DO UPDATE SET plan = 'pro', source = 'bundle', bundle_id = bundle,
    granted_by = actor, note = NULL, updated_at = now();
  RETURN 'assigned';
END
$$;--> statement-breakpoint
-- The plan's owner frees the seat a server takes. Returns 'free' or 'not_owner'.
CREATE OR REPLACE FUNCTION public.plan_bundle_release(actor text, guild text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM public.guild_plans p USING public.plan_bundles b
  WHERE p.guild_id = guild AND p.bundle_id = b.id AND b.owner_id = actor;
  RETURN CASE WHEN FOUND THEN 'free' ELSE 'not_owner' END;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_bundle_set_comp(text, text, integer, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_bundle_remove_comp(text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_bundle_assign(text, uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.plan_bundle_release(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.plan_bundle_set_comp(text, text, integer, text) TO garrison_web;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.plan_bundle_remove_comp(text, uuid) TO garrison_web;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.plan_bundle_assign(text, uuid, text) TO garrison_web;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.plan_bundle_release(text, text) TO garrison_web;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.plan_bundle_set_comp(text, text, integer, text) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.plan_bundle_remove_comp(text, uuid) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.plan_bundle_assign(text, uuid, text) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.plan_bundle_release(text, text) FROM anon, authenticated';
  END IF;
END
$$;
