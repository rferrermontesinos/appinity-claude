ALTER TABLE "notification_deliveries" ADD COLUMN "receipts_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "receipt_errors" integer;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "previous_refresh_token_hash" text;--> statement-breakpoint
CREATE INDEX "auth_sessions_previous_refresh_idx" ON "auth_sessions" USING btree ("previous_refresh_token_hash");