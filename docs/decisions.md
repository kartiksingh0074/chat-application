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
