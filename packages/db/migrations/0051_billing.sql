CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "stripe_status" text;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD COLUMN "paid_by" text;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "stripe_status" text;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_bundles" ADD COLUMN "paid_by" text;--> statement-breakpoint
-- Billing: the Stripe webhook logs in as garrison_billing, which can only call the four
-- functions below. The owner gives it a password once (ALTER ROLE garrison_billing LOGIN
-- PASSWORD '...') and stores that connection string as BILLING_DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'garrison_billing') THEN
    CREATE ROLE garrison_billing NOLOGIN NOINHERIT;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO garrison_billing;--> statement-breakpoint
-- The dashboard reads billing state to show "Manage billing"; it never writes it.
-- (guild_plans and plan_bundles are already readable by garrison_web.)
--
-- Record an event once. Returns false if it was already applied (Stripe retries).
CREATE OR REPLACE FUNCTION public.billing_record_event(event_id text, event_type text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.billing_events (id, type) VALUES (left(event_id, 255), left(event_type, 100))
  ON CONFLICT (id) DO NOTHING;
  RETURN FOUND;
END
$$;--> statement-breakpoint
-- A server's own Pro subscription. Active: the server is Pro, paid through Stripe (taking
-- over from free Pro or an Agency seat). Not active: drop it, only if this subscription
-- is the one on record. Returns 'pro', 'free' or 'ignored'.
CREATE OR REPLACE FUNCTION public.billing_set_guild(
  guild text, active boolean, customer text, subscription text, status text,
  period_end timestamptz, cancel_at_end boolean, payer text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF guild !~ '^[0-9]{17,20}$' OR subscription IS NULL THEN
    RETURN 'ignored';
  END IF;
  IF active THEN
    IF NOT EXISTS (SELECT 1 FROM public.guilds g WHERE g.id = guild) THEN
      RETURN 'ignored';
    END IF;
    INSERT INTO public.guild_plans (guild_id, plan, source, bundle_id, granted_by, note,
      stripe_customer_id, stripe_subscription_id, stripe_status, current_period_end,
      cancel_at_period_end, paid_by, updated_at)
    VALUES (guild, 'pro', 'stripe', NULL, NULL, NULL, customer, subscription, status,
      period_end, coalesce(cancel_at_end, false), payer, now())
    ON CONFLICT (guild_id) DO UPDATE SET plan = 'pro', source = 'stripe', bundle_id = NULL,
      granted_by = NULL, note = NULL, stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      stripe_status = EXCLUDED.stripe_status, current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end, paid_by = EXCLUDED.paid_by,
      updated_at = now();
    RETURN 'pro';
  END IF;
  DELETE FROM public.guild_plans p
  WHERE p.guild_id = guild AND p.source = 'stripe' AND p.stripe_subscription_id = subscription;
  RETURN CASE WHEN FOUND THEN 'free' ELSE 'ignored' END;
END
$$;--> statement-breakpoint
-- An Agency subscription for a Discord user. Active: create or update the plan (5 seats).
-- Not active: remove it, which frees every seat. Returns 'agency', 'removed' or 'ignored'.
CREATE OR REPLACE FUNCTION public.billing_set_agency(
  owner text, seat_count integer, active boolean, customer text, subscription text,
  status text, period_end timestamptz, cancel_at_end boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE b uuid;
BEGIN
  IF owner !~ '^[0-9]{17,20}$' OR subscription IS NULL OR seat_count NOT BETWEEN 1 AND 25 THEN
    RETURN 'ignored';
  END IF;
  SELECT id INTO b FROM public.plan_bundles WHERE stripe_subscription_id = subscription LIMIT 1;
  IF NOT active THEN
    DELETE FROM public.plan_bundles WHERE id = b;
    RETURN CASE WHEN FOUND THEN 'removed' ELSE 'ignored' END;
  END IF;
  IF b IS NULL THEN
    INSERT INTO public.plan_bundles (owner_id, seats, source, stripe_customer_id,
      stripe_subscription_id, stripe_status, current_period_end, cancel_at_period_end, paid_by)
    VALUES (owner, seat_count, 'stripe', customer, subscription, status, period_end,
      coalesce(cancel_at_end, false), owner);
  ELSE
    UPDATE public.plan_bundles SET seats = seat_count, stripe_customer_id = customer,
      stripe_status = status, current_period_end = period_end,
      cancel_at_period_end = coalesce(cancel_at_end, false), updated_at = now()
    WHERE id = b;
  END IF;
  RETURN 'agency';
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_record_event(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_set_guild(text, boolean, text, text, text, timestamptz, boolean, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_set_agency(text, integer, boolean, text, text, text, timestamptz, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_record_event(text, text) TO garrison_billing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_set_guild(text, boolean, text, text, text, timestamptz, boolean, text) TO garrison_billing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_set_agency(text, integer, boolean, text, text, text, timestamptz, boolean) TO garrison_billing;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.billing_record_event(text, text) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.billing_set_guild(text, boolean, text, text, text, timestamptz, boolean, text) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.billing_set_agency(text, integer, boolean, text, text, text, timestamptz, boolean) FROM anon, authenticated';
  END IF;
END
$$;
