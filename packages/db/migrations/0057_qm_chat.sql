ALTER TYPE "public"."dashboard_action_kind" ADD VALUE 'qm_chat';--> statement-breakpoint
CREATE TABLE "qm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"build_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qm_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qm_messages" ADD CONSTRAINT "qm_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qm_messages" ADD CONSTRAINT "qm_messages_build_id_qm_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."qm_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qm_messages_thread" ON "qm_messages" USING btree ("guild_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "qm_messages_author" ON "qm_messages" USING btree ("guild_id","author_id","created_at");--> statement-breakpoint
GRANT SELECT, INSERT ON public.qm_messages TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.qm_messages AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.qm_messages TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.qm_messages AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
