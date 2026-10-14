CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"match_seen_at" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "conversations_ordered" CHECK ("conversations"."user_low" < "conversations"."user_high"),
	CONSTRAINT "conversations_origin_valid" CHECK ("conversations"."origin" IN ('request', 'mutual', 'friendship', 'direct')),
	CONSTRAINT "conversations_status_valid" CHECK ("conversations"."status" IN ('active', 'closed')),
	CONSTRAINT "conversations_closed" CHECK (("conversations"."status" = 'closed') = ("conversations"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "message_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "message_requests_not_self" CHECK ("message_requests"."sender_id" <> "message_requests"."recipient_id"),
	CONSTRAINT "message_requests_kind_valid" CHECK ("message_requests"."kind" IN ('interest', 'direct')),
	CONSTRAINT "message_requests_status_valid" CHECK ("message_requests"."status" IN ('pending', 'accepted', 'ignored')),
	CONSTRAINT "message_requests_first_message" CHECK (("message_requests"."kind" = 'direct') = ("message_requests"."first_message" IS NOT NULL) AND ("message_requests"."first_message" IS NULL OR char_length("message_requests"."first_message") BETWEEN 1 AND 1000)),
	CONSTRAINT "message_requests_responded" CHECK (("message_requests"."status" = 'pending') = ("message_requests"."responded_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_length" CHECK (char_length("messages"."body") BETWEEN 1 AND 1000),
	CONSTRAINT "messages_client_id_length" CHECK ("messages"."client_id" IS NULL OR char_length("messages"."client_id") <= 64)
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_low_users_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_high_users_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_unique" ON "conversations" USING btree ("user_low","user_high");--> statement-breakpoint
CREATE INDEX "conversations_high_idx" ON "conversations" USING btree ("user_high");--> statement-breakpoint
CREATE UNIQUE INDEX "message_requests_pair_unique" ON "message_requests" USING btree ("sender_id","recipient_id");--> statement-breakpoint
CREATE INDEX "message_requests_recipient_idx" ON "message_requests" USING btree ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "message_requests_sender_created_idx" ON "message_requests" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_created_idx" ON "messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_unique" ON "messages" USING btree ("sender_id","client_id");--> statement-breakpoint
-- Las amistades aceptadas antes de esta migración ya tienen chat (mismo comportamiento que las nuevas).
INSERT INTO "conversations" ("user_low", "user_high", "origin", "matched_at")
SELECT least("requester_id", "addressee_id"), greatest("requester_id", "addressee_id"), 'friendship', coalesce("responded_at", now())
FROM "friendships" WHERE "status" = 'accepted'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "conversation_members" ("conversation_id", "user_id", "match_seen_at")
SELECT "id", "user_low", "matched_at" FROM "conversations"
UNION ALL SELECT "id", "user_high", "matched_at" FROM "conversations"
ON CONFLICT DO NOTHING;
