-- drizzle-kit does not emit extension statements, so this is added by hand.
-- Without it the vector(768) column below fails to create.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "message_embeddings" (
	"message_id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_bot_config" (
	"room_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"system_prompt" text,
	"top_k" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "body_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bot_config" ADD CONSTRAINT "room_bot_config_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_embeddings_hnsw" ON "message_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_embeddings_room" ON "message_embeddings" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_messages_tsv" ON "messages" USING gin ("body_tsv");