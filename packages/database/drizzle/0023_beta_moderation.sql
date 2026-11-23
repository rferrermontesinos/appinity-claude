ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_reports" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
-- Por si alguna cuenta se suspendió a mano antes de B9: sin fecha, la restricción de abajo no se podría crear.
UPDATE "users" SET "suspended_at" = "updated_at" WHERE "status" = 'suspended';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_at" CHECK (("users"."status" = 'suspended') = ("users"."suspended_at" IS NOT NULL));