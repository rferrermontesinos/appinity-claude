CREATE TABLE "recommendation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "recommendation_actions_action_valid" CHECK ("recommendation_actions"."action" IN ('dismiss', 'keep'))
);
--> statement-breakpoint
CREATE TABLE "recommendation_impressions" (
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"first_shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"times_shown" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recommendation_impressions_user_id_catalog_item_id_pk" PRIMARY KEY("user_id","catalog_item_id"),
	CONSTRAINT "recommendation_impressions_times_positive" CHECK ("recommendation_impressions"."times_shown" > 0)
);
--> statement-breakpoint
ALTER TABLE "recommendation_actions" ADD CONSTRAINT "recommendation_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_actions" ADD CONSTRAINT "recommendation_actions_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_actions_user_idx" ON "recommendation_actions" USING btree ("user_id","created_at");