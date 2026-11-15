ALTER TABLE "qm_builds" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "qm_builds" ADD COLUMN "continues_id" uuid;--> statement-breakpoint
ALTER TABLE "qm_builds" ADD CONSTRAINT "qm_builds_continues_id_qm_builds_id_fk" FOREIGN KEY ("continues_id") REFERENCES "public"."qm_builds"("id") ON DELETE set null ON UPDATE no action;