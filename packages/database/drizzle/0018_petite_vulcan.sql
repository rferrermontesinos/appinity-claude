CREATE TABLE "catalog_expansions" (
	"dataset" text NOT NULL,
	"category" text NOT NULL,
	"next_offset" integer DEFAULT 0 NOT NULL,
	"exhausted" boolean DEFAULT false NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_expansions_dataset_category_pk" PRIMARY KEY("dataset","category")
);
