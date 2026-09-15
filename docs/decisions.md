# Decisions

One short entry per non-obvious choice and its alternative.

## Phase 1

**Drizzle over raw `pg`.** §2 allows either. Chose Drizzle for typed schema/query building and
`drizzle-kit` migrations, while staying out of "heavy ORM" territory (no active-record models,
no hidden query generation beyond what's written).

**npm workspaces over pnpm/Turborepo.** Ships with Node, no extra tooling to install or justify
against §10's "prefer the boring solution." Revisit only if build caching across packages becomes
a real bottleneck.

**JWT delivered via `socket.handshake.auth` from Phase 1, not deferred to Phase 6.** §6 only
formally calls this out as a Phase 6 hardening step, but there's no simpler interim approach worth
building first — doing it correctly from the start avoids a rework pass later. Phase 6 still adds
the Origin whitelist and per-socket rate limiting on top of this.

**`drizzle-orm` added as a root-level dependency too, not just in `server`.** `drizzle-kit`'s
binary is hoisted to the repo root `node_modules`, and its internal compatibility check does a
bare `import("drizzle-orm/relations")` that resolves from the binary's own location upward — it
never sees `server/node_modules`, so without a root-level copy `drizzle-kit generate` fails with
the misleading "Please install latest version of drizzle-orm" even when the right version is
installed. This is a known npm-workspaces/drizzle-kit interaction, not something wrong with our
setup.

**Postgres container published on host port 5433, not 5432.** This machine already runs a native
Windows PostgreSQL 16 service that auto-starts and binds `0.0.0.0:5432` (IPv4); Docker's port
publish for the same 5432 bound only the IPv6 side (`::5432`). "localhost" resolving to whichever
one first meant connections randomly hit the wrong Postgres instance, surfacing as a misleading
"password authentication failed" (Postgres intentionally doesn't distinguish "wrong password" from
"role doesn't exist" in that message). Remapping the container to 5433 avoids the collision
entirely rather than touching the native service. `DATABASE_URL` in `.env.example`/`server/.env`
uses port 5433 accordingly.

**Docker Desktop over local Postgres/Redis, WSL2 required.** Followed §2 as written. This machine
needed WSL2 installed and enabled (Windows 11 Home only supports Docker's WSL2 backend, not
Hyper-V) plus firmware virtualization already on — both are one-time host setup, not part of the
repo.

**Known accepted dev-only vulnerability: esbuild <=0.24.2 (moderate).** Pulled in transitively by
`vite`/`vitest`/`drizzle-kit`. Only exploitable by a malicious site making requests to a
developer's local dev server while it's running — no production/runtime exposure. Fixing it means
a major-version bump to Vite 8, which isn't worth the compatibility risk this early. The
production-facing `drizzle-orm` SQL-injection advisory in the same `npm audit` run (GHSA-gpj5-g38j-94v9)
*was* fixed by bumping to `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10`.

**Room creation is not an API in Phase 1.** No REST/socket endpoint for creating rooms yet; a seed
script (`server/src/seed.ts`) creates a fixed demo room ("general") with two demo users as
members, since Phase 1's exit criterion only needs two tabs able to join *a* room and exchange
messages, and room-management endpoints aren't specified anywhere in the phase plan.

## Phase 5

**Client now talks to nginx by default, not a single local server process.** `client/src/config.ts`
defaults `API_BASE_URL` to `http://localhost:8080` (nginx) and is overridable via
`VITE_API_BASE_URL` for pointing at a bare `npm run dev -w server` instance on `:4000` when
horizontal-scaling behavior specifically isn't what's being tested. This is a one-way move: from
Phase 5 on, the tested/expected topology is nginx + N node containers, not a single local process.

**`transports: ['websocket']` forced on the client socket.** nginx's `least_conn` has no
sticky-session config. A single long-lived WebSocket connection naturally stays pinned to whichever
node it was balanced to; Socket.IO's default HTTP long-polling handshake is a sequence of separate
requests that could each get load-balanced to a *different* node and never complete the handshake.
Skipping polling entirely sidesteps the problem rather than configuring session affinity.

**nginx upstream needs an explicit `zone` for `least_conn` to actually balance anything.** Hit this
directly: with the default `worker_processes auto` (one nginx worker per CPU core) and no `zone` on
the upstream block, each worker process tracks connection counts independently in its own memory.
Every worker's view ties at zero, so every worker picks the same first-listed backend — load never
actually balances, even though the config looks correct. `zone chat_backend_zone 64k;` shares the
counters across workers. Discovered when a scripted two-client test showed both landing on `node-1`
despite `least_conn` being configured.

**`server/Dockerfile.worker` merged into a single `server/Dockerfile`.** (Phase 5) Both the worker and the
app server (`node-1`/`node-2`) are the same image; only the container `command` differs
(`docker-compose.yml` overrides it for the `worker` service). Avoids maintaining two near-identical
Dockerfiles that would drift out of sync as the app grows.

## Phase 6

**`minio` SDK over AWS SDK v3.** §2 names MinIO but not a client library. The official `minio`
package is purpose-built for exactly this (`presignedPutObject`) and is far lighter than pulling in
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

**`MINIO_ENDPOINT` is the browser-facing host, even inside containers.** The endpoint gets baked
into the presigned URL, and it's the *browser* that PUTs to it - so it must be `localhost:9000`,
not the compose hostname `minio:9000`, which a browser can't resolve. This works from inside
node-1/node-2 only because presigning is offline (see next entry).

**`MINIO_REGION` is pinned so presigning needs no network call.** Found this the hard way: without
an explicit region the SDK does a `GetBucketLocation` round-trip before signing, which fails with
`ECONNREFUSED 127.0.0.1:9000` inside a container (where the browser-facing endpoint isn't
routable), and — because Express 4 doesn't catch async handler rejections — took the whole node
process down, surfacing as a 502 from nginx. Pinning the region makes signing pure local crypto.
The presign route now also try/catches so a storage failure returns 500 instead of crashing.

**Never `z.coerce.boolean()` for env flags.** It's JS `Boolean()` semantics, so the string
`"false"` is truthy and `MINIO_USE_SSL=false` turned TLS *on*, producing a confusing
`packet length too long` SSL error against a plaintext MinIO. Parsed as `v === 'true'` instead.

**Attachments bucket is public-read; uploads still require a presigned PUT.** Lets the client
`<img src>` an attachment directly without a presigned-GET round-trip per render. Reads being
public is acceptable for this project; writes are not.

**Known accepted vulnerability: `decode-uri-component` (moderate, DoS).** Pulled in transitively by
`minio` -> `query-string`. Not reachable in our usage: object keys are server-generated ULIDs and
no attacker-controlled percent-encoded input reaches that parser. The only npm-offered fix is a
breaking downgrade to `minio@7.0.26`. Same posture as the esbuild entry above.

## UI Stage A

**A DM's display name is resolved on the server, not the client.** The stored `rooms.name` for a
direct room is `"alice & bob"` — one string that is wrong for both participants. The obvious fix is
to derive the title in the client from the other member, but the sidebar lists *every* DM while
`useMembers` only loads the active room, so that would mean one `/rooms/:id/members` request per
conversation on every page load. `GET /rooms` now returns a `peer` for direct rooms via a single
extra query for the whole list, and `roomTitle()` prefers it. The stored name is left in place as a
stable server-side label for logs and admin queries.

**Attachment type travels in the object key, not a new column.** `messages` has only
`attachment_key`, so the client had no way to tell a PDF from a PNG. Rather than migrate, the
presign route appends an extension derived from the *validated content type* — never from the
client's filename, so `thing.xyz` uploaded as an unknown type becomes `.bin`, not `.xyz`. Keys
written before this change have no extension and still render as images, which is correct: the
picker was `accept="image/*"` at the time.

**The filename in the key is cosmetic and sanitised to `[A-Za-z0-9._-]`.** It exists so a file card
has something readable to show. The ULID still provides uniqueness, so the name carries no
correctness weight — path separators and URL-significant characters are stripped
(`../../etc/passwd` becomes `passwd`).

**Presign refuses `text/html`, `image/svg+xml` and XML types.** MinIO serves objects from its own
origin, so storing those would make the bucket a script-hosting endpoint. This is a real (if small)
hardening: `accept="image/*"` was only ever a client-side hint and the server accepted anything.
Widening the picker to all files made it worth closing.

**`@chat-application/shared` now has an `index.ts` barrel.** `events.ts` is the socket contract
copied verbatim from §5 and shouldn't accumulate unrelated helpers, so attachment conventions live
in `attachments.ts` and the package entrypoint re-exports both. `MAX_MESSAGE_LENGTH` moved there
too, so the composer's counter and the socket handler's Zod schema cannot drift.


## UI Stage B

**`--color-surface-nav` is a new token, not a reuse of `surface-raised`.** In a chat client the
nav recedes behind the conversation, but this palette's `raised` is *lighter* than `surface` in
dark mode (it is what lifts the composer and cards forward). Reusing it would have pushed the
sidebar toward the viewer instead of away. A fourth surface shade was cheaper and clearer than
inverting the meaning of an existing one.

**Dark is the default theme, not `system`.** A chat window sits open in the background all day and
is read on dark far more often than not. `system` is still one click away in settings and still
tracks OS changes live.

**The unread count keys off the last message id, not array length.** Loading older history
prepends and therefore also grows `messages.length`, so a length-delta counter would report
scrollback as unread. Prepending never changes the last element, so comparing that id is what
separates a genuinely new message from a page of history.

**No message-enter animation.** `react-virtuoso` unmounts and remounts rows as they leave and
re-enter the viewport, so a CSS enter animation fires again every time an old message scrolls back
into view - the list appears to twitch while scrolling. Animating only freshly-appended ids would
work but needs a timer-backed id set for a 160 ms fade. Not worth the state churn, and Discord
does not animate message entry either.

**The hover toolbar ships with one button.** §1 rules out reactions, replies and threads; edit and
delete need the `edited_at` / `deleted_at` migration that is deferred; and jump-to-message needs
the Stage D `around` query. That leaves copy. Building the toolbar now anyway is still worth it -
the positioning and hover/focus handling are the fiddly part, and Stage D only has to add a button.


## UI Stage C

**Typing membership is checked against `socket.rooms`, not Postgres.** Typing fires orders of
magnitude more often than sending, so a `room_members` lookup per keystroke would put the hot path
back on the database - exactly what section 3 forbids. `room:join` already verifies membership
before joining, and a socket is only ever in rooms it joined, so the room set is an authoritative
membership check that costs nothing. Typing also gets its own rate-limit budget rather than eating
the message allowance.

**Typing indicators expire on a timer instead of trusting `typing:stop`.** A closed tab, a lost
connection or a dropped packet never sends the stop event. The client re-announces every 2.5 s and
entries expire after 6 s, so a missed stop clears itself. A permanently stuck "alice is typing" is
worse than one that lingers a few seconds.

**Avatars are keyed by owner: `avatars/<user id>/<ulid>.<ext>`.** That prefix is what lets
`PATCH /users/me` verify from the key alone that the object belongs to the caller, with no extra
round-trip to storage. Without it a user could point their avatar at someone else's upload, or at a
room attachment from a room they have since been removed from. Verified: both are rejected with 400.

**The typing broadcast needed no new Redis code.** `socket.to(room).emit()` already goes through
the `@socket.io/redis-adapter` installed in Phase 5, so a typist on node-1 reaches a reader on
node-2 for free. Adding a separate Redis key for "who is typing" would only matter for showing
indicators to someone who joins mid-typing, which is not worth a round-trip per keystroke.

**nginx caches upstream IPs at startup - recreating app containers alone silently breaks load
balancing.** Found while verifying that typing crosses instances: all eight test connections landed
on node-1. `docker compose up -d --build node-1 node-2` gives the containers new IPs, but nginx had
resolved `node-1:4000` / `node-2:4000` once at config load and kept the old addresses. Connections
to the stale IP were refused, nginx retried the surviving peer, and every request quietly served
from a single instance - capacity halved with no visible error. `server ... resolve` is NGINX Plus
only, so the fix for open-source nginx is to recreate it whenever the app containers are recreated:

    docker compose up -d --build node-1 node-2 && docker compose up -d --force-recreate nginx

Worth remembering before any future benchmark run: a Phase 7 measurement taken in this state would
have reported single-node numbers while appearing to test two.


## UI Stage D

**`around` is two bounded scans, not one clever query.** `id <= target` descending for the older
half and `id > target` ascending for the newer half, merged. Both are indexed range scans with a
LIMIT, so a jump costs the same whether the citation points at yesterday or at message 250,000.
Measured on the 505k-row seeded room: 0.06 ms and ~6 shared buffers per half, and 20 ms for the
whole round trip through nginx.

Worth noting for accuracy: with one room dominating the table the planner picks `messages_pkey`
and filters `room_id`, not `idx_messages_room_id_desc`. The property that matters - cost
independent of depth, no OFFSET - holds either way, and a realistic multi-room distribution would
favour the composite index.

**A jump remounts the list instead of calling `scrollToIndex`.** Virtuoso requires `firstItemIndex`
to only ever decrease, which a jump backwards through history cannot honour, and with
`firstItemIndex` in play `scrollToIndex` and `initialTopMostItemIndex` do not agree on a coordinate
space. Remounting on a `windowEpoch` key sidesteps both: `initialTopMostItemIndex` is unambiguously
an index into the data array. The cost is discarding scroll position, which a jump discards anyway.

**`followOutput` is disabled while the window is mid-history.** Following the tail is only correct
when the tail is loaded. Without this, a message arriving while you read a citation would yank you
away from it. For the same reason the scroll-to-bottom button refetches the live tail rather than
scrolling, when there are newer messages outside the window.

**Streaming renders outside the virtualized list.** Tokens arrive several times a second, and
pushing each through Virtuoso as a changed item would re-measure the list on every character. The
in-flight answer is its own block above the composer; once persisted it becomes an ordinary message
and the list takes over.

**Open question for Phase 8: citations have nowhere to live.** Section 8.6 carries them on the
`bot:complete` event, and 8.3's schema has no column for them - so a bot answer read back from
history has no citations to render, and the chips vanish on reload. Phase 8 has to either add a
column (a `citations text[]` on `messages`, or a `message_citations` join table) or re-run
retrieval to rebuild them. Flagged rather than decided, since it changes 8.3's schema. The client
lookup is in-memory only today and returns nothing after a refresh, which is the honest behaviour
until that is settled.

**What is and is not verified here.** The `around` / `after` query shapes, the jump, forward
loading and the highlight are verified against the running stack with 505k messages. The bot
streaming and citation rendering are unit-tested at the reducer level and typecheck against the
8.6 event contract, but nothing emits those events yet - end-to-end verification belongs to Phase 8.


## Phase 8 groundwork

**`postgres:16` has no pgvector; the image is now `pgvector/pgvector:pg16`.** Checked before
writing any of section 8.3 rather than discovering it at migration time:
`pg_available_extensions` had no `vector` row at all, so `CREATE EXTENSION vector` would simply
have failed. The pgvector image is postgres:16 plus the extension (0.8.6), same major version, so
the existing volume and data directory are reused - verified by row counts before and after
(2 users, 5 rooms, 505,818 messages, unchanged).

**That swap moved the database onto an older glibc, which needed a REINDEX.** The two images are
built on different Debian releases: the data directory was created under glibc 2.41 and
pgvector/pgvector:pg16 provides 2.36, so Postgres warned about a collation version mismatch on
every connection. This is not cosmetic here - `en_US.utf8` ordering can differ between glibc
versions, and `idx_messages_room_id_desc` is on *text* columns, which is exactly what every
cursor-pagination query compares against. ULIDs are pure ASCII and almost certainly sort
identically either way, but "almost certainly" is not a property to build pagination on.
`REINDEX DATABASE chatapp` took 3.5 s on 505k rows, followed by
`ALTER DATABASE chatapp REFRESH COLLATION VERSION`. Pagination re-verified afterwards: still an
index scan, 0.11 ms.

**Groq covers both halves of section 8, which was not obvious.** Groq is documented as an
OpenAI-compatible *chat* endpoint and its models page lists no embedding model, so the natural
assumption is that it cannot serve section 8.4. Probing the API settles it: `POST /openai/v1/embeddings`
returns 401 (exists, wants a key) while `POST /openai/v1/models` returns 404, which is the control
proving the 401 is real and not a blanket response. So one free provider covers generation and
embeddings both.

**Section 8.3's `vector(1536)` is sized for OpenAI, not Groq.** 1536 is
`text-embedding-3-small`'s width. Groq serves `nomic-embed-text-v1_5`, which is not 1536-wide, and
pgvector fixes the dimension in the column type - so the exact value is confirmed with a live call
before the migration is written rather than assumed.

**The 505k seeded messages cannot be the RAG corpus.** They are all one sentence with a counter
("Seed message #432805 for load testing scrollback and pagination"), which is right for what they
were built for - Phase 3's scrollback and Phase 7's benchmarks - and useless for retrieval: every
embedding would be near-identical, so recall@10 and MRR would measure nothing, and section 8.8's 30
labelled questions have no ground truth to point at. Embedding them is not free either: ~8.0M
tokens, which against the free tier's 6,000 TPM is roughly 22 hours of throughput and ~5 days
against the 1,000 requests/day cap. They stay in place for the phases that need them and are
excluded from embedding; Phase 8 gets its own generated corpus in separate rooms.


## Phase 8, part 1 - schema and retrieval (no API key needed)

**`nomic-embed-text-v1_5` requires task instruction prefixes, and omitting them fails silently.**
Documents must be embedded as `search_document: <text>` and questions as `search_query: <text>`.
Getting this wrong does not error - retrieval just gets worse - so it would have quietly biased
every number in 8.8 with nothing to point at. The prefixes are applied inside
`rag/embeddings.ts` rather than left to callers, so there is one place to get it right.

**The vector column is 768, not 8.3's 1536.** 1536 is `text-embedding-3-small`'s width; this build
embeds with Groq's nomic model, which is 768 (Matryoshka-capable down to 64). pgvector fixes the
width in the column type, so `EMBEDDING_DIMENSIONS` in `db/schema.ts` is the single source and the
embed client asserts the API's actual width against it on every call - a model swap fails with a
message naming the fix instead of an opaque insert error.

**drizzle-kit does not emit `CREATE EXTENSION`.** The generated migration declared a
`vector(768)` column with no extension statement, which fails outright. Added by hand at the top
of `0002_*.sql`. Worth remembering for any future pgvector migration.

**Live embedding is one message per job; batching lives in the backfill.** 8.4 says the worker
"batches up to 100 messages per API call", and this deviates deliberately. BullMQ hands a
processor one job at a time, so batching inside it means either holding jobs open while a batch
fills - adding latency and risking stalled locks - or acknowledging siblings by hand outside
BullMQ's lifecycle. (`Worker.getNextJobs` does not exist; only `getNextJob`.) The volume 8.4 is
actually worried about is backfill: live traffic is human-speed and one call per message sits well
inside 30 RPM, while backfill is thousands at once and is where the requests-per-day budget is at
stake. So `backfillEmbeddings.ts` batches at `EMBED_BATCH_SIZE` and the worker does not.

**The backfill refuses to run without explicit `--room` arguments.** There is no "embed
everything" mode on purpose: the 505k load-test messages are one sentence with a counter, and an
accidental full run would spend ~8M tokens producing half a million near-identical vectors. Naming
rooms explicitly makes that impossible to do by accident.

**Keyword ranking is not indexed, and it shows on a large room.** GIN answers `body_tsv @@ query`
quickly, but `ORDER BY ts_rank(...) LIMIT n` computes the rank for every matching row before
sorting. Measured on the seeded room: a query matching two messages returns in 46 ms, one matching
all 505k takes 688 ms, and a query matching nothing takes 1.8 ms. Irrelevant for realistic rooms of
a few thousand messages, but worth knowing before 8.8's p95 numbers are read - a slow hybrid result
there would be the keyword arm, not the vector search. If it ever matters, the fix is to bound the
candidate set in a subquery before ranking.

**8.7 criterion 2 is already covered by an automated test, before the bot exists.**
`test/ragSecurity.test.ts` runs against the real database and writes its own embeddings directly,
so it needs no API key. It checks the obvious case - a non-member is refused in all three modes -
and the subtle one: both a private room and the outsider's own room hold the *identical* vector, so
if the room filter were missing or applied after the top-k, the private message would rank top in
the outsider's own search. It does not. That is the leak 8.5 calls non-negotiable, and it is the
kind of property that cannot be established by reading SQL strings.


## Phase 8, part 2 - local embeddings and the 8.8 evaluation

Numbers for everything below are in `docs/benchmarks.md`, experiment 5.

**Embeddings run locally with `bge-small-en-v1.5`, not through Groq.** Groq's model catalogue lists
no embedding model, and PROJECT.md 2 names `bge-small-en` via transformers.js as the alternative to
a hosted one. Local also suits a benchmark that gets re-run: no key, no request cap to hit while
iterating, and a model that cannot change underneath a measurement. It needs no GPU and no WSL - it
runs on native Windows Node at about 272 MB. The column is 384 wide, down from 768; the table was
empty, so the migration was a plain type change and the HNSW index rebuilt cleanly. Groq stays for
generation only.

**BGE's conventions differ from nomic's, and both mistakes are silent.** BGE prefixes the *query*
only, never the documents (nomic prefixes both), and uses CLS pooling rather than mean pooling.
Either mistake degrades retrieval without an error. Both live in `rag/embeddings.ts` alone, and a
probe confirmed normalised output before anything was built on it.

**The persist worker must never load the ML runtime.** It imported `isEmbeddable` from
`embeddings.ts`, so a static transformers.js import would have pulled ONNX into the chat worker
container just to check a message's length. The check moved to `rag/chunking.ts`, and the model is
loaded by dynamic import on first use.

**The corpus is scripted, not LLM-generated.** Generating it with Groq needs the key, and a scripted
corpus gives exact ground truth anyway: each of the 30 questions points at planted messages, and
nothing else counts. Its weakness is real and is the first threat to validity in the benchmark: ~30
templates per room make clusters of near-identical messages, which pushes ranks to all-or-nothing.
The Groq-generated corpus should be added once the key is available, to test whether the ranking
survives more natural text.

**Question categories are verified with Postgres's own stemmer.** "Paraphrase" is a claim about
shared words, so `ragCorpus.test.ts` checks it with `to_tsvector('english')` - the tokeniser the
keyword arm uses - rather than by eye. The same test fails if filler contains a term anchoring a
planted answer. Screening is word-start, not substring: `ebs` must not match `websocket`.

**Near misses are hand-written for every planted fact.** A probe before the corpus existed showed
"we should deploy the release on monday morning" scoring 0.66 against "when is the deployment
window?" and the real answer only 0.49. Without deliberate wrong answers on the same topic, vector
search would look far better than it is.

**The vector arm uses pgvector's iterative scan with `ef_search = 100`.** §8.5's query as written
returned 27.7 rows of LIMIT 50 on a four-room index, because the room filter is applied after a
~40-candidate graph walk. It changed no final score here, but the loss grows with the number of
rooms sharing the index, and iterative scan fixes it without per-room indexes (§8.2 rules those
out). The settings are `SET LOCAL` inside a transaction so they cannot leak onto a pooled connection.

**The query vector is sent once.** Drizzle makes each interpolation its own parameter, so putting
the distance in both `SELECT` and `ORDER BY` shipped the ~4.5 KB vector twice and hit a ~40 ms
delayed-ACK stall on the hop into WSL2 - 49 ms p50 against Postgres's sub-millisecond execution.
Ordering by the output alias sends it once and still uses the index (checked with EXPLAIN).

**The official keyword arm stays §8.5's AND matching; OR and fusion depth are diagnostics only.**
AND matching returns nothing for 22 of 30 natural-language questions, and OR matching or narrower
fusion both score better. Neither became the default: both were measured on the same 30 questions
used for scoring, and changing the default on that basis would be tuning to the test set. They are
reported as mechanisms, with that caveat stated beside them.

**Accepted vulnerabilities from transformers.js.** `npm audit` reports four high-severity findings
arriving with `@huggingface/transformers`, none with a fix: `sharp` (libvips image-decoding CVEs),
`adm-zip` (a crafted ZIP forcing a 4 GB allocation), and `onnxruntime-node` and transformers.js
flagged transitively. None is reachable here - the library is only ever given message text from
our own database, never an image or an archive, and it runs only in the embedding and evaluation
processes, not in the socket servers. The moderate `express` / `qs` findings predate this change.

**A blank `GROQ_API_KEY=` reads as unset.** Left empty in `.env`, it would otherwise fail `min(1)`
and stop the whole server at boot, including everything that does not need a key.

**Known gap: nothing consumes the embed queue in Docker.** The persist worker enqueues an embed job
for each live message, but the embed worker is not a docker-compose service - it runs on the host
(`npm run embed:worker -w server`), which keeps the model out of the WSL2 memory allocation. Until
it runs, live messages stay keyword-searchable (§8.4) and their jobs wait in Redis.


## Phase 8, part 3 - the @bot answer path

**Answers are generated in a worker, not the socket servers.** The bot has to embed the question,
and 8.4 forbids the socket path from calling an embedding model. Doing it in node-1 and node-2
would also load a ~270 MB model into each and block their event loops on CPU inference. So the
socket handler only checks the rate limit and enqueues; the RAG worker retrieves, calls Groq and
saves the answer. Verified after the first live answers: both socket servers stayed at ~110 MB.

**The worker reaches sockets through Redis pub/sub and `io.local`.** Answers stream to sockets the
worker does not hold. It publishes each event to one channel; every node subscribes and emits to
its own sockets with `io.local`. `io.to` would send the event back through the Redis adapter to
every node, and with both nodes subscribed each token would arrive twice.
`@socket.io/redis-emitter` does this off the shelf, but it is not in PROJECT.md 2 (10 says ask
first) and the ioredis client already in use needs a few lines. The relay accepts only the four
bot events, so Redis cannot be used to emit arbitrary events into rooms.

**One worker process embeds and answers.** It replaces the embed-only worker, so the model loads
once. This also closes the gap noted in part 2: while the RAG worker runs, live messages are
embedded as they arrive. It is still not a docker-compose service; it runs on the host with
`npm run rag:worker -w server`, which keeps the model outside the WSL2 memory allocation.

**Citations are stored on the message (`messages.citations text[]`).** 8.6 sends them only on
`bot:complete` and 8.3's schema had nowhere to keep them, so chips would have vanished on reload.
One nullable column; only bot messages set it.

**Citations are renumbered in order of use, and invented numbers are dropped.** The prompt numbers
sources 1..n in retrieval order, but chips are shown in the order the answer cites them, so an
answer citing only source 7 would otherwise read "[7]" beside a single chip "[1]". A number outside
1..n is removed rather than trusted: 8.7 requires every citation to be a real message in the room,
and a model can cite a source that does not exist.

**Only `delta.content` is forwarded, and reasoning is switched off.** `openai/gpt-oss-120b` is a
reasoning model and Groq streams its private reasoning first, in a separate `reasoning` field.
Forwarding every chunk would post it into the room and save it as the answer. The request sets
`include_reasoning: false`, and the parser reads only `content` in case a model sends it anyway.

**Retrieved messages are treated as untrusted.** They are chat anyone in the room could write, so
the system prompt says never to follow instructions inside them, and newlines inside a message are
collapsed so nobody can post a message that forges an extra numbered source line. This reduces
prompt injection; it does not eliminate it.

**The bot never answers from itself.** Its own earlier answers and the `@bot` questions are removed
from the sources - the asker's own question matches itself better than anything else and contains
nothing new.

**Bot jobs are never retried.** An answer streams to the room as it is generated, so a retry after
a partial failure would stream a second answer over the first. Failures reach the room as
`bot:error`, with a generic reason; the detail is logged.

**The bot's account is created by migration with an unusable password.** 8.6 saves answers "as a
normal message from the bot user". Created in the migration rather than on first use so the
username is taken before anyone can register it. `verifyPassword` now returns false for a stored
value that is not an argon2 hash - argon2 throws on it, which would have made a login attempt as
`bot` a 500 instead of "invalid credentials".

**Two bugs found on the way.** History used `db.select()`, which returns every column: since
`body_tsv` was added in part 1, each page of history shipped every message's search index to the
browser. It now lists columns explicitly, with a test. And the first live answer crashed with
`date.toISOString is not a function`: the vector arm's raw `execute()` skips drizzle's mapping, so
its timestamps were strings ("2026-09-15 18:50:32.506+00") despite being typed as `Date`. Nothing
had read that field until the prompt formatted it. The query now asks Postgres for ISO-8601, and a
test checks every retrieval mode returns real Dates.


## UI refresh, and three bugs the screenshots exposed

Screenshots of the running app were taken with headless Chrome over the DevTools protocol, before
and after, rather than judging the UI from its code.

**Presence is a set of connections, not a counter.** The member panel showed everyone offline,
including the viewer: presence was only pushed as changes, so nobody who was already online when a
page loaded ever appeared. Member lists and people search now carry a presence snapshot. That fix
exposed a worse bug underneath: presence was a counter, incremented on connect and decremented on
disconnect, and a node that dies never runs its disconnects. After one rebuild a single browser tab
counted as 2, so closing it would have left the user online forever - hidden until now only because
nobody showed as online at all. Presence is now `online:<userId>`, a set of `<nodeId>|<socketId>`,
plus a per-node index; a starting node renames its index away atomically and removes what its
previous run held. Verified live: a SIGKILLed node left a stale entry, its restart cleared it, and
closing the tab took the user offline. Limit: a node that never starts again leaves its entries
until one with the same NODE_ID does.

**Citations accept `【n】` as well as `[n]`.** `gpt-oss` wrote `【1】` in a live answer despite a
`[2]` example in the prompt, and that answer saved no citations - the parser read only ASCII
brackets. It now reads the full-width form, including the `【1†source】` locator variant, and the
prompt asks for ASCII explicitly. The earlier check that "all 4 saved citations are valid" could
not see this, because it only examined citations that had been saved.

**The bot is excluded from people search.** It appeared in Find people with a Message button; it
is addressed with @bot, not messaged.

**Icons are hand-drawn SVGs, not `lucide-react`.** Emoji rendered at inconsistent sizes and weights,
and the envelope rendered as a blank rectangle on Windows. A package would be the usual answer, but
it is a dependency PROJECT.md 2 does not list and the choice was not confirmed, so ~20 icons were
drawn on one 24-unit grid with a shared stroke instead. Swapping to a package later only means
replacing `ui/icons.tsx`.

**Inter is self-hosted, not loaded from Google Fonts.** One variable WOFF2 (344 KB) in
`client/public/fonts`, with its SIL Open Font License beside it. No package and no third-party
request at runtime. `cv05` and `cv08` are switched on so l, I and 1 are distinct in ids like
`PLAT-2208`. Message text went from 14px to 15px.

**Loud controls were quietened.** The Members toggle was a filled brand-colour button, the most
prominent thing on screen; it is now an icon button. The `danger` variant is text-coloured rather
than a solid red block. Send is muted until there is something to send. The composer's
"Enter to send / Shift+Enter" line is gone; its space shows who is typing, or an @bot tip while the
box is focused and empty.

**Settings no longer reads like a debug panel.** The raw user id, API URL and transport type are
gone; it is Profile, Appearance and Account.

**The app reopens the last room, per account.** It used to open the first room, which dropped
everyone into `#general`'s load-test messages.

**Two layout traps worth remembering.** Message rows use padding, not `margin-top`: inside a
virtualised item a child's top margin can collapse through its wrapper, so Virtuoso would measure
every row short and the list would jump while scrolling. And a responsive "hide below xl" on
`IconButton` has to be `max-xl:hidden`, not `hidden xl:inline-flex`: the button's own `inline-flex`
is a plain utility that outranks a plain `hidden`, which left two Members buttons on mobile.
