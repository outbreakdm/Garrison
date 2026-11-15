CREATE TABLE "supply_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"pack" text NOT NULL,
	"supplies" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"bought_by" text,
	"stripe_session_id" text NOT NULL,
	"stripe_payment_intent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "supply_grants_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "supply_grants_used" CHECK ("supply_grants"."used" BETWEEN 0 AND "supply_grants"."supplies")
);
--> statement-breakpoint
ALTER TABLE "supply_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "pack_supplies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qm_builds" ADD COLUMN "pack_supplies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supply_grants" ADD CONSTRAINT "supply_grants_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supply_grants_guild" ON "supply_grants" USING btree ("guild_id","expires_at");--> statement-breakpoint
CREATE INDEX "supply_grants_payment" ON "supply_grants" USING btree ("stripe_payment_intent");--> statement-breakpoint
-- The bot counts what packs pay for; it can't add supplies or change what a pack holds.
GRANT SELECT ON public.supply_grants TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (used) ON public.supply_grants TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.supply_grants AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_use" ON public.supply_grants AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT UPDATE (pack_supplies) ON public.ai_usage TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (pack_supplies) ON public.qm_builds TO garrison_bot;--> statement-breakpoint
-- The dashboard shows a server's packs; it never writes them.
GRANT SELECT ON public.supply_grants TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.supply_grants AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
-- A paid supply pack, from the Stripe webhook. Once per Checkout Session, so a retried event
-- can't grant twice. Returns 'granted', 'duplicate' or 'ignored'.
CREATE OR REPLACE FUNCTION public.billing_grant_supplies(
  session text, guild text, pack_name text, supply_count integer, amount integer,
  payment_intent text, buyer text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF session IS NULL OR guild !~ '^[0-9]{17,20}$' OR amount IS NULL OR amount <= 0
    OR NOT ((pack_name = 'small' AND supply_count = 1000) OR (pack_name = 'large' AND supply_count = 5000)) THEN
    RETURN 'ignored';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guilds g WHERE g.id = guild) THEN
    RETURN 'ignored';
  END IF;
  INSERT INTO public.supply_grants (guild_id, pack, supplies, amount_cents, bought_by,
    stripe_session_id, stripe_payment_intent, expires_at)
  VALUES (guild, pack_name, supply_count, amount, left(buyer, 20), left(session, 255),
    left(payment_intent, 255), now() + interval '365 days')
  ON CONFLICT (stripe_session_id) DO NOTHING;
  RETURN CASE WHEN FOUND THEN 'granted' ELSE 'duplicate' END;
END
$$;--> statement-breakpoint
-- A pack's payment was refunded in full or disputed: what's left of it can't be used.
CREATE OR REPLACE FUNCTION public.billing_revoke_supplies(payment_intent text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF payment_intent IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.supply_grants SET revoked_at = now()
  WHERE stripe_payment_intent = payment_intent AND revoked_at IS NULL;
  RETURN FOUND;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_grant_supplies(text, text, text, integer, integer, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_revoke_supplies(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_grant_supplies(text, text, text, integer, integer, text, text) TO garrison_billing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_revoke_supplies(text) TO garrison_billing;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.billing_grant_supplies(text, text, text, integer, integer, text, text) FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.billing_revoke_supplies(text) FROM anon, authenticated';
  END IF;
END
$$;
