CREATE TABLE "follows" (
	"follower_user_id" uuid NOT NULL,
	"followed_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_user_id_followed_user_id_pk" PRIMARY KEY("follower_user_id","followed_user_id"),
	CONSTRAINT "follows_not_self" CHECK ("follows"."follower_user_id" <> "follows"."followed_user_id")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "public_creator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "creator_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_followed_idx" ON "follows" USING btree ("followed_user_id");