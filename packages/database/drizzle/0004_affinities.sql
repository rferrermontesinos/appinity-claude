CREATE TABLE "category_affinities" (
	"source_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"score" double precision NOT NULL,
	"confidence" double precision NOT NULL,
	"common_items" integer NOT NULL,
	"effective_evidence" double precision NOT NULL,
	"agreement" double precision NOT NULL,
	"coverage" double precision NOT NULL,
	"algorithm_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_affinities_source_user_id_target_user_id_category_pk" PRIMARY KEY("source_user_id","target_user_id","category"),
	CONSTRAINT "category_affinities_not_self" CHECK ("category_affinities"."source_user_id" <> "category_affinities"."target_user_id"),
	CONSTRAINT "category_affinities_category_valid" CHECK ("category_affinities"."category" IN ('food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts')),
	CONSTRAINT "category_affinities_score_range" CHECK ("category_affinities"."score" BETWEEN 0 AND 100),
	CONSTRAINT "category_affinities_confidence_range" CHECK ("category_affinities"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "category_affinities_agreement_range" CHECK ("category_affinities"."agreement" BETWEEN 0 AND 1),
	CONSTRAINT "category_affinities_coverage_range" CHECK ("category_affinities"."coverage" BETWEEN 0 AND 1),
	CONSTRAINT "category_affinities_counts" CHECK ("category_affinities"."common_items" > 0 AND "category_affinities"."effective_evidence" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_affinities" (
	"source_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"confidence" double precision NOT NULL,
	"categories_compared" integer NOT NULL,
	"common_items" integer NOT NULL,
	"algorithm_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_affinities_source_user_id_target_user_id_pk" PRIMARY KEY("source_user_id","target_user_id"),
	CONSTRAINT "user_affinities_not_self" CHECK ("user_affinities"."source_user_id" <> "user_affinities"."target_user_id"),
	CONSTRAINT "user_affinities_score_range" CHECK ("user_affinities"."score" BETWEEN 0 AND 100),
	CONSTRAINT "user_affinities_confidence_range" CHECK ("user_affinities"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "user_affinities_counts" CHECK ("user_affinities"."categories_compared" BETWEEN 1 AND 8 AND "user_affinities"."common_items" > 0)
);
--> statement-breakpoint
ALTER TABLE "category_affinities" ADD CONSTRAINT "category_affinities_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_affinities" ADD CONSTRAINT "category_affinities_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affinities" ADD CONSTRAINT "user_affinities_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affinities" ADD CONSTRAINT "user_affinities_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_affinities_target_idx" ON "category_affinities" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_affinities_ranking_idx" ON "user_affinities" USING btree ("source_user_id","score" DESC NULLS LAST,"confidence" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_affinities_target_idx" ON "user_affinities" USING btree ("target_user_id");