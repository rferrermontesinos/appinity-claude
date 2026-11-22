CREATE TABLE "catalog_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"dataset" text NOT NULL,
	"provider" text NOT NULL,
	"id_type" text NOT NULL,
	"external_id" text NOT NULL,
	"contributed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_external_ids_provider_format" CHECK ("catalog_external_ids"."provider" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "catalog_external_ids_type_format" CHECK ("catalog_external_ids"."id_type" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "catalog_external_ids_value_not_blank" CHECK (char_length(btrim("catalog_external_ids"."external_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"source" text NOT NULL,
	"source_image_id" text,
	"url" text NOT NULL,
	"original_url" text,
	"storage_key" text,
	"mime" text,
	"width" integer,
	"height" integer,
	"alt" text NOT NULL,
	"author" text,
	"license" text,
	"license_url" text,
	"attribution_required" boolean DEFAULT false NOT NULL,
	"description_url" text,
	"restrictions" text,
	"cache_status" text DEFAULT 'reference' NOT NULL,
	"cache_error" text,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_images_url_scheme" CHECK ("catalog_images"."url" ~ '^https://'),
	CONSTRAINT "catalog_images_cached_has_key" CHECK ("catalog_images"."cache_status" <> 'cached' OR "catalog_images"."storage_key" IS NOT NULL),
	CONSTRAINT "catalog_images_size_positive" CHECK (("catalog_images"."width" IS NULL OR "catalog_images"."width" > 0) AND ("catalog_images"."height" IS NULL OR "catalog_images"."height" > 0))
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"description" text,
	"release_date" date,
	"release_date_precision" text,
	"event_starts_at" timestamp with time zone,
	"event_ends_at" timestamp with time zone,
	"event_date_precision" text,
	"parent_item_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN longitude IS NULL OR latitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END) STORED,
	"locality" text,
	"country_code" text,
	"external_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_dataset_valid" CHECK ("catalog_items"."dataset" IN ('demo', 'live')),
	CONSTRAINT "catalog_items_category_valid" CHECK (category IN ('food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts')),
	CONSTRAINT "catalog_items_item_type_format" CHECK ("catalog_items"."item_type" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "catalog_items_title_not_blank" CHECK (char_length(btrim("catalog_items"."title")) > 0),
	CONSTRAINT "catalog_items_release_precision" CHECK (("catalog_items"."release_date" IS NULL) = ("catalog_items"."release_date_precision" IS NULL)),
	CONSTRAINT "catalog_items_event_precision" CHECK (("catalog_items"."event_starts_at" IS NULL AND "catalog_items"."event_ends_at" IS NULL) OR "catalog_items"."event_date_precision" IS NOT NULL),
	CONSTRAINT "catalog_items_event_order" CHECK ("catalog_items"."event_ends_at" IS NULL OR "catalog_items"."event_starts_at" IS NULL OR "catalog_items"."event_ends_at" >= "catalog_items"."event_starts_at"),
	CONSTRAINT "catalog_items_location_complete" CHECK (("catalog_items"."latitude" IS NULL) = ("catalog_items"."longitude" IS NULL)),
	CONSTRAINT "catalog_items_no_self_parent" CHECK ("catalog_items"."parent_item_id" IS NULL OR "catalog_items"."parent_item_id" <> "catalog_items"."id")
);
--> statement-breakpoint
CREATE TABLE "provider_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"consent_version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_credentials" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"mode" text DEFAULT 'incremental' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"records_received" integer DEFAULT 0 NOT NULL,
	"observations_inserted" integer DEFAULT 0 NOT NULL,
	"observations_updated" integer DEFAULT 0 NOT NULL,
	"observations_unchanged" integer DEFAULT 0 NOT NULL,
	"observations_deleted" integer DEFAULT 0 NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"partial_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"cursor_before" jsonb,
	"cursor_after" jsonb,
	CONSTRAINT "source_sync_runs_status_valid" CHECK ("source_sync_runs"."status" IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
	CONSTRAINT "source_sync_runs_counts_non_negative" CHECK ("source_sync_runs"."records_received" >= 0 AND "source_sync_runs"."observations_inserted" >= 0 AND "source_sync_runs"."observations_updated" >= 0 AND "source_sync_runs"."observations_unchanged" >= 0 AND "source_sync_runs"."observations_deleted" >= 0 AND "source_sync_runs"."items_created" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"external_account_ref" text,
	"consent_id" uuid,
	"sync_cursor" jsonb,
	"watermark_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_connections_status_valid" CHECK ("user_connections"."status" IN ('active', 'error', 'revoked')),
	CONSTRAINT "user_connections_revoked_at" CHECK (("user_connections"."status" = 'revoked') = ("user_connections"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "user_item_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"source_record_id" text NOT NULL,
	"observation_kind" text NOT NULL,
	"mapper_version" text NOT NULL,
	"known_confidence" double precision NOT NULL,
	"consumed_confidence" double precision NOT NULL,
	"preference_score" double precision,
	"preference_confidence" double precision,
	"preference_basis" text,
	"engagement" jsonb,
	"occurred_at" timestamp with time zone,
	"timestamp_precision" text,
	"content_hash" text NOT NULL,
	"first_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_item_observations_known_range" CHECK (known_confidence BETWEEN 0 AND 1),
	CONSTRAINT "user_item_observations_consumed_range" CHECK (consumed_confidence BETWEEN 0 AND 1),
	CONSTRAINT "user_item_observations_consumed_implies_known" CHECK (consumed_confidence <= known_confidence),
	CONSTRAINT "user_item_observations_preference_range" CHECK (preference_score IS NULL OR preference_score BETWEEN -1 AND 1),
	CONSTRAINT "user_item_observations_preference_confidence_range" CHECK (preference_confidence IS NULL OR (preference_confidence > 0 AND preference_confidence <= 1)),
	CONSTRAINT "user_item_observations_preference_nulls_coherent" CHECK ((preference_score IS NULL) = (preference_confidence IS NULL) AND (preference_score IS NULL) = (preference_basis IS NULL)),
	CONSTRAINT "user_item_observations_preference_basis_valid" CHECK (preference_basis IS NULL OR preference_basis IN ('explicit_rating', 'explicit_like', 'strong_behavior', 'attendance', 'weak_behavior')),
	CONSTRAINT "user_item_observations_time_precision" CHECK (("user_item_observations"."occurred_at" IS NULL) = ("user_item_observations"."timestamp_precision" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "user_item_profiles" (
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"known_confidence" double precision NOT NULL,
	"consumed_confidence" double precision NOT NULL,
	"preference_score" double precision,
	"preference_confidence" double precision,
	"preference_basis" text,
	"evidence_count" integer NOT NULL,
	"source_count" integer NOT NULL,
	"has_conflict" boolean DEFAULT false NOT NULL,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"consolidation_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_item_profiles_user_id_catalog_item_id_pk" PRIMARY KEY("user_id","catalog_item_id"),
	CONSTRAINT "user_item_profiles_known_range" CHECK (known_confidence BETWEEN 0 AND 1),
	CONSTRAINT "user_item_profiles_consumed_range" CHECK (consumed_confidence BETWEEN 0 AND 1),
	CONSTRAINT "user_item_profiles_consumed_implies_known" CHECK (consumed_confidence <= known_confidence),
	CONSTRAINT "user_item_profiles_preference_range" CHECK (preference_score IS NULL OR preference_score BETWEEN -1 AND 1),
	CONSTRAINT "user_item_profiles_preference_confidence_range" CHECK (preference_confidence IS NULL OR (preference_confidence > 0 AND preference_confidence <= 1)),
	CONSTRAINT "user_item_profiles_preference_nulls_coherent" CHECK ((preference_score IS NULL) = (preference_confidence IS NULL) AND (preference_score IS NULL) = (preference_basis IS NULL)),
	CONSTRAINT "user_item_profiles_preference_basis_valid" CHECK (preference_basis IS NULL OR preference_basis IN ('explicit_rating', 'explicit_like', 'strong_behavior', 'attendance', 'weak_behavior')),
	CONSTRAINT "user_item_profiles_counts_positive" CHECK ("user_item_profiles"."evidence_count" > 0 AND "user_item_profiles"."source_count" > 0 AND "user_item_profiles"."source_count" <= "user_item_profiles"."evidence_count")
);
--> statement-breakpoint
ALTER TABLE "catalog_external_ids" ADD CONSTRAINT "catalog_external_ids_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_parent_item_id_catalog_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_consents" ADD CONSTRAINT "provider_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_credentials" ADD CONSTRAINT "source_credentials_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_consent_id_provider_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."provider_consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_observations" ADD CONSTRAINT "user_item_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_observations" ADD CONSTRAINT "user_item_observations_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_observations" ADD CONSTRAINT "user_item_observations_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_profiles" ADD CONSTRAINT "user_item_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_profiles" ADD CONSTRAINT "user_item_profiles_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_external_ids_unique" ON "catalog_external_ids" USING btree ("dataset","provider","id_type","external_id");--> statement-breakpoint
CREATE INDEX "catalog_external_ids_item_idx" ON "catalog_external_ids" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_images_item_role_unique" ON "catalog_images" USING btree ("catalog_item_id","role");--> statement-breakpoint
CREATE INDEX "catalog_items_dataset_category_idx" ON "catalog_items" USING btree ("dataset","category");--> statement-breakpoint
CREATE INDEX "catalog_items_normalized_title_idx" ON "catalog_items" USING btree ("dataset","category","normalized_title");--> statement-breakpoint
CREATE INDEX "catalog_items_parent_idx" ON "catalog_items" USING btree ("parent_item_id");--> statement-breakpoint
CREATE INDEX "catalog_items_location_gist" ON "catalog_items" USING gist ("location");--> statement-breakpoint
CREATE INDEX "provider_consents_user_idx" ON "provider_consents" USING btree ("user_id","source_key");--> statement-breakpoint
CREATE INDEX "source_sync_runs_connection_idx" ON "source_sync_runs" USING btree ("connection_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_connections_one_open_per_source" ON "user_connections" USING btree ("user_id","source_key") WHERE "user_connections"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "user_connections_user_idx" ON "user_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_item_observations_idempotency" ON "user_item_observations" USING btree ("connection_id","source_record_id","observation_kind");--> statement-breakpoint
CREATE INDEX "user_item_observations_user_item_idx" ON "user_item_observations" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "user_item_observations_item_idx" ON "user_item_observations" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "user_item_profiles_item_idx" ON "user_item_profiles" USING btree ("catalog_item_id");