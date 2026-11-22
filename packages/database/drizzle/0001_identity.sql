CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"country_code" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_display_name_length" CHECK (char_length("user_profiles"."display_name") BETWEEN 1 AND 64),
	CONSTRAINT "user_profiles_country_code_format" CHECK ("user_profiles"."country_code" IS NULL OR "user_profiles"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"time_zone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"radius_km" smallint DEFAULT 10 NOT NULL,
	"location_label" text,
	"location_latitude" double precision,
	"location_longitude" double precision,
	"location_source" text,
	"location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN location_longitude IS NULL OR location_latitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(location_longitude, location_latitude), 4326)::geography END) STORED,
	"location_updated_at" timestamp with time zone,
	"discoverable_by_contacts" boolean DEFAULT true NOT NULL,
	"notification_frequency" text DEFAULT 'three_per_week' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_radius_range" CHECK ("user_settings"."radius_km" BETWEEN 1 AND 50),
	CONSTRAINT "user_settings_locale_valid" CHECK ("user_settings"."locale" IN ('es', 'en')),
	CONSTRAINT "user_settings_location_complete" CHECK (("user_settings"."location_latitude" IS NULL) = ("user_settings"."location_longitude" IS NULL) AND ("user_settings"."location_latitude" IS NULL) = ("user_settings"."location_source" IS NULL)),
	CONSTRAINT "user_settings_location_range" CHECK ("user_settings"."location_latitude" IS NULL OR ("user_settings"."location_latitude" BETWEEN -90 AND 90 AND "user_settings"."location_longitude" BETWEEN -180 AND 180)),
	CONSTRAINT "user_settings_notification_frequency_valid" CHECK ("user_settings"."notification_frequency" IN ('daily', 'three_per_week', 'weekly', 'off'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"dataset" text DEFAULT 'live' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"adult_confirmed_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"demo_note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_handle_format" CHECK ("users"."handle" ~ '^[a-z0-9_]{3,32}$'),
	CONSTRAINT "users_dataset_valid" CHECK ("users"."dataset" IN ('demo', 'live')),
	CONSTRAINT "users_status_valid" CHECK ("users"."status" IN ('active', 'suspended', 'deleted')),
	CONSTRAINT "users_demo_note_only_demo" CHECK ("users"."demo_note" IS NULL OR "users"."dataset" = 'demo')
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_settings_location_gist" ON "user_settings" USING gist ("location");