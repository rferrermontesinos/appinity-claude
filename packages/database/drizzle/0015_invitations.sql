CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"inviter_id" uuid NOT NULL,
	"max_uses" integer DEFAULT 20 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_uses_range" CHECK ("invitations"."uses" >= 0 AND "invitations"."uses" <= "invitations"."max_uses")
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_code_unique" ON "invitations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invitations_inviter_idx" ON "invitations" USING btree ("inviter_id");