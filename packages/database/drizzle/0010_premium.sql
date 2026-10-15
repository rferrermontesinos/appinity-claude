CREATE TABLE "entitlements" (
	"user_id" uuid NOT NULL,
	"entitlement_id" text NOT NULL,
	"environment" text NOT NULL,
	"active" boolean NOT NULL,
	"product_id" text,
	"expires_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_user_id_entitlement_id_environment_pk" PRIMARY KEY("user_id","entitlement_id","environment"),
	CONSTRAINT "entitlements_environment_valid" CHECK ("entitlements"."environment" IN ('sandbox', 'production'))
);
--> statement-breakpoint
CREATE TABLE "revenuecat_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"environment" text,
	"user_id" uuid,
	"product_id" text,
	"event_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenuecat_events" ADD CONSTRAINT "revenuecat_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revenuecat_events_user_idx" ON "revenuecat_events" USING btree ("user_id");