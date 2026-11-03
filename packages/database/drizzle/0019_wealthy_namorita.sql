CREATE TABLE "item_votes" (
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_votes_user_id_catalog_item_id_pk" PRIMARY KEY("user_id","catalog_item_id"),
	CONSTRAINT "item_votes_value_valid" CHECK ("item_votes"."value" IS NULL OR "item_votes"."value" IN (-2, -1, 1, 2))
);
--> statement-breakpoint
ALTER TABLE "recommendation_actions" DROP CONSTRAINT "recommendation_actions_action_valid";--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_actions" ADD CONSTRAINT "recommendation_actions_action_valid" CHECK ("recommendation_actions"."action" IN ('dismiss', 'keep', 'vote'));