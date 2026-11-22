CREATE TABLE "catalog_relation_checks" (
	"catalog_item_id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"relations_found" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_relations" (
	"source_item_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"weight" double precision NOT NULL,
	"provider" text DEFAULT 'wikidata' NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_relations_source_item_id_target_item_id_relation_pk" PRIMARY KEY("source_item_id","target_item_id","relation"),
	CONSTRAINT "catalog_relations_weight_range" CHECK ("catalog_relations"."weight" > 0 AND "catalog_relations"."weight" <= 1),
	CONSTRAINT "catalog_relations_not_self" CHECK ("catalog_relations"."source_item_id" <> "catalog_relations"."target_item_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_relation_checks" ADD CONSTRAINT "catalog_relation_checks_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_relations" ADD CONSTRAINT "catalog_relations_source_item_id_catalog_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_relations" ADD CONSTRAINT "catalog_relations_target_item_id_catalog_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_relations_source_idx" ON "catalog_relations" USING btree ("source_item_id");