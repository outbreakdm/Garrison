ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'economy_adjust';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'economy_buy';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'economy_purchase';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE 'economy';--> statement-breakpoint
CREATE TABLE "economy_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"actor_id" text,
	"actor_name" text,
	"item_id" text,
	"day" date,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_ledger_source" CHECK ("economy_ledger"."source" IN ('chat', 'voice', 'daily', 'level', 'give', 'take', 'pay_in', 'pay_out', 'buy', 'refund'))
);
--> statement-breakpoint
ALTER TABLE "economy_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "economy_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"price" bigint NOT NULL,
	"kind" text NOT NULL,
	"role_id" text,
	"expires_at" timestamp with time zone,
	"status" text NOT NULL,
	"decided_by" text,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_purchases_status" CHECK ("economy_purchases"."status" IN ('done', 'waiting', 'refunded', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "economy_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "economy_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"currency" jsonb,
	"earn" jsonb,
	"shop" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"staff_channel_id" text,
	"no_earn_channel_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_shop_list" CHECK (jsonb_typeof("economy_settings"."shop") = 'array' AND jsonb_array_length("economy_settings"."shop") <= 50)
);
--> statement-breakpoint
ALTER TABLE "economy_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallets" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_daily" date,
	"paid_today" bigint DEFAULT 0 NOT NULL,
	"paid_day" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id"),
	CONSTRAINT "wallets_balance" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD CONSTRAINT "economy_ledger_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_purchases" ADD CONSTRAINT "economy_purchases_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD CONSTRAINT "economy_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_ledger_guild_at" ON "economy_ledger" USING btree ("guild_id","at");--> statement-breakpoint
CREATE INDEX "economy_ledger_member" ON "economy_ledger" USING btree ("guild_id","user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "economy_ledger_daily_sum" ON "economy_ledger" USING btree ("guild_id","user_id","source","day") WHERE "economy_ledger"."day" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "economy_purchases_item" ON "economy_purchases" USING btree ("guild_id","item_id");--> statement-breakpoint
CREATE INDEX "economy_purchases_member" ON "economy_purchases" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "wallets_rich" ON "wallets" USING btree ("guild_id","balance");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the economy's settings (history in
-- settings_changes) and only reads wallets, the ledger and purchases: every balance change
-- is the bot's, through a dashboard request it checks again. The bot reads the settings.
GRANT SELECT ON public.economy_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.economy_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, currency, earn, shop, staff_channel_id, no_earn_channel_ids, updated_at) ON public.economy_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, currency, earn, shop, staff_channel_id, no_earn_channel_ids, updated_at) ON public.economy_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.economy_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.economy_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.economy_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (balance, streak, last_daily, paid_today, paid_day, updated_at) ON public.wallets TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.wallets AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.wallets AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.wallets AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.wallets TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.wallets AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (amount, balance_after, at) ON public.economy_ledger TO garrison_bot;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.economy_ledger_id_seq TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.economy_ledger AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.economy_ledger AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.economy_ledger AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.economy_ledger AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.economy_ledger TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.economy_ledger AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (status, decided_by, channel_id, message_id) ON public.economy_purchases TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.economy_purchases AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.economy_purchases AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.economy_purchases AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.economy_purchases TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.economy_purchases AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
