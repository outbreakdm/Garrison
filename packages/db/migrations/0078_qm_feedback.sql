ALTER TABLE "qm_messages" ADD COLUMN "feedback" smallint;--> statement-breakpoint
ALTER TABLE "qm_messages" ADD COLUMN "feedback_note" text;--> statement-breakpoint
ALTER TABLE "qm_messages" ADD COLUMN "feedback_at" timestamp with time zone;--> statement-breakpoint
-- The dashboard rates a reply (its own author's, checked in the page's action); it may set
-- only these three columns.
GRANT UPDATE (feedback, feedback_note, feedback_at) ON public.qm_messages TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_feedback" ON public.qm_messages AS PERMISSIVE FOR UPDATE TO garrison_web USING (role = 'assistant') WITH CHECK (role = 'assistant');
