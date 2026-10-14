CREATE TABLE "home_dismissals" (
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_dismissals_user_id_catalog_item_id_pk" PRIMARY KEY("user_id","catalog_item_id")
);
--> statement-breakpoint
ALTER TABLE "home_dismissals" ADD CONSTRAINT "home_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_dismissals" ADD CONSTRAINT "home_dismissals_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_dismissals_item_idx" ON "home_dismissals" USING btree ("catalog_item_id");