ALTER TABLE "messages" ADD COLUMN "citations" text[];--> statement-breakpoint
-- The bot's account (PROJECT.md 8.6 persists answers "as a normal message from
-- the bot user"). Added by hand: drizzle-kit does not emit data. Created here
-- rather than on first use so the username is taken before anyone can register
-- it. '!' is not a valid argon2 hash, so no password can ever match.
INSERT INTO "users" ("id", "username", "password_hash") VALUES ('bot', 'bot', '!') ON CONFLICT DO NOTHING;
