# Scalable Real-Time Chat — Project Specification

> This file is the source of truth for the build. Read it fully before writing code.
> If a decision here conflicts with a "better idea", follow this file and raise the conflict.

## 1. What we are building

A real-time chat application (Node.js + React) built as a **scalability study**, not a
feature-complete messenger. The goal is to demonstrate, with measurements, that the
system handles horizontal scaling, deep message history, and unreliable networks — and
that semantic retrieval over that history can be served from the same infrastructure.

The final deliverable includes two measured reports: a load test comparing one Node
instance against two behind a load balancer, and a retrieval evaluation comparing
keyword, vector, and hybrid search. **Those reports matter more than any individual
feature.**

### Scope

In scope:
- 1-to-1 and group (room) text messaging
- Message history with infinite scrollback
- Optimistic send with delivery status
- File/image attachments via direct-to-storage upload
- Reconnection with missed-message replay
- Metrics dashboard
- `@bot` semantic Q&A over a room's history (RAG) — §8

Explicitly **out of scope** — do not build these, do not suggest them:
- End-to-end encryption
- uWebSockets.js, WebTransport, WebRTC
- Cassandra / ScyllaDB / MongoDB
- Postgres range partitioning (stretch only, see §9)
- A separate vector database (Pinecone, Weaviate, Qdrant) — pgvector only, see §8
- Voice/video, reactions, threads, read receipts beyond delivered/sent
- Kernel sysctl tuning as code (it is a written report section only)

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+, TypeScript | strict mode on |
| Realtime | Socket.IO v4 | typed events, see §5 |
| Scale-out | Redis Pub/Sub adapter | `@socket.io/redis-adapter` |
| Recovery | Redis Streams adapter | `@socket.io/redis-streams-adapter` (stretch only, §9) |
| Jobs | BullMQ | Redis-backed |
| DB | PostgreSQL 16 | `pg` or Drizzle, no heavy ORM |
| IDs | ULID | `ulidx` |
| Storage | MinIO (S3-compatible) | presigned PUT |
| Frontend | React 18 + Vite + TypeScript | |
| List | `react-virtuoso` | reverse infinite scroll |
| LB | nginx | `least_conn` |
| Vectors | pgvector extension | same Postgres, no new datastore |
| Embeddings | `text-embedding-3-small` (1536d) | or `bge-small-en` locally via transformers.js |
| LLM | any OpenAI-compatible endpoint | must support streaming |
| Keyword search | `tsvector` + GIN | required for the hybrid baseline, §8 |
| Metrics | prom-client → Prometheus → Grafana | |
| Load test | k6 | |
| Local infra | docker-compose | Postgres, Redis, MinIO, nginx, Prometheus, Grafana |

## 3. Architecture

```
React client ──ws──┐
React client ──ws──┼──> nginx (least_conn) ──> node-1 ──┐
React client ──ws──┘                      └──> node-2 ──┤
                                                        ├──> Redis (pub/sub + streams + BullMQ)
                                                        ├──> BullMQ persist worker ──> Postgres
                                                        ├──> BullMQ embed worker  ──> Postgres (pgvector)
                                                        ├──> bot service ──> retrieve ──> LLM (streamed back over ws)
                                                        └──> MinIO (presigned, client uploads direct)
```

Key rules:
- The socket process **never** writes to Postgres on the hot path. It validates, assigns
  an ID, broadcasts, and enqueues. Persistence happens in a worker.
- Attachment bytes never pass through Node. Client PUTs straight to MinIO.
- Any state shared between instances lives in Redis, never in process memory.

## 4. Data model

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- ULID
  username    TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- argon2
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,          -- ULID
  name        TEXT NOT NULL,
  is_direct   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_members (
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,          -- ULID, chronologically sortable
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  sender_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT,
  attachment_key TEXT,                   -- MinIO object key, nullable
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only index scrollback needs. Do not add an index on created_at.
CREATE INDEX idx_messages_room_id_desc ON messages (room_id, id DESC);
```

**Why ULID, and what to write in the report:** UUIDv4 is random, so every insert lands at a
random point in the B-tree, causing page splits and cache invalidation. ULIDs embed a
48-bit timestamp, so inserts append to the right edge of the index. The same column then
serves as both the sort key and the pagination cursor, so no separate timestamp index is
needed. Benchmark this in Phase 7.

## 5. Socket contract

Define these in a shared `packages/shared/events.ts` imported by both client and server,
and pass them as Socket.IO generics so the compiler enforces payload shapes.

```ts
interface ServerToClientEvents {
  'message:new':     (m: Message) => void;
  'message:ack':     (p: { tempId: string; id: string; createdAt: string }) => void;
  'presence:update': (p: { userId: string; online: boolean }) => void;
  'error':           (p: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  'message:send': (p: { roomId: string; tempId: string; body?: string; attachmentKey?: string }) => void;
  'room:join':    (p: { roomId: string }) => void;
  'room:leave':   (p: { roomId: string }) => void;
}
```

`tempId` is a client-generated ULID used to reconcile the optimistic bubble with the
server-assigned ID.

## 6. Build phases

Work one phase at a time. Each phase ends with a working, committed, demoable state.
Do not start the next phase until the exit criteria pass.

### Phase 1 — Foundation (week 1)
Monorepo (`server/`, `client/`, `shared/`). docker-compose with Postgres and Redis.
Migrations for §4. Username/password auth issuing a short-lived JWT. Single Socket.IO
instance. Messages written synchronously to Postgres for now.

**Exit:** two browser tabs exchange messages in a room; messages survive a server restart.

### Phase 2 — Client shell (week 2)
React app with a socket held in a context provider (one connection for the whole app,
closed only when the last subscriber unmounts). Room list, message list, composer.
No virtualization yet.

**Exit:** usable UI against Phase 1 server; no duplicate listeners on hot reload.

### Phase 3 — History and rendering (week 3)
Cursor pagination: `GET /rooms/:id/messages?before=<ulid>&limit=50` →
`SELECT ... WHERE room_id = $1 AND id < $2 ORDER BY id DESC LIMIT 50`.
Never use OFFSET. Wire `react-virtuoso` with reverse infinite scroll and scroll-position
preservation on prepend. Optimistic send: append immediately with status `pending`, flip
to `delivered` on `message:ack`, `failed` on timeout.

**Exit:** seed 500k messages; scroll to the very top; no layout jump, no visible stall.

### Phase 4 — Async persistence (week 4)
Add BullMQ. The socket handler now: validate → assign ULID → broadcast → `message:ack`
→ enqueue persist job. A separate worker process writes to Postgres with retries and
exponential backoff. Run the worker as its own container.

**Exit:** kill the worker, send 100 messages, restart the worker — all 100 land in
Postgres and none were lost.

### Phase 5 — Horizontal scaling (week 5) ← the centrepiece
Add `@socket.io/redis-adapter`. Run `node-1` and `node-2`. Put nginx in front with
`least_conn` and correct `Upgrade`/`Connection` headers. Remove every piece of
in-process shared state; presence moves to Redis keys.

**Exit:** client A pinned to node-1 and client B pinned to node-2 exchange messages in
real time. Verify by checking each container's logs.

### Phase 6 — Attachments and hardening (week 6)
`POST /uploads/presign` returns a short-lived MinIO PUT URL; the client uploads directly
and sends only the object key over the socket. Then security:
- Validate the `Origin` header on the WS upgrade against a whitelist (mitigates CSWSH —
  cookies would be attached automatically by the browser, JWT in the handshake is not)
- JWT in `socket.handshake.auth`, never cookies
- Per-socket rate limit on `message:send`
- Discard the raw HTTP request object after handshake to flatten memory growth

**Exit:** a 5 MB image uploads with no memory spike in the Node process; a connection
from an unlisted origin is rejected.

### Phase 7 — Measurement (week 7) ← the marks are here
- prom-client `/metrics`: event loop lag, active sockets, `ws_reconnections_total`,
  message throughput, V8 heap
- Prometheus + Grafana in compose, one dashboard
- k6 scripts driving realistic connect/send/idle behaviour

Run and record these four experiments:
1. One instance vs two: p50/p95/p99 delivery latency as connections climb
2. Sync DB write (Phase 1 code path) vs BullMQ: event loop lag under the same load
3. Cursor vs OFFSET pagination at depth 10 / 1k / 100k rows
4. ULID vs UUIDv4: insert throughput into 1M rows, plus final index size

Write results to `docs/benchmarks.md` with charts. Every claim in the final report must
trace to a number in this file.

### Phase 8 — RAG bot (week 8)
Build §8 in full. This phase replaces the previously planned connection state recovery
work, which moves to §9. Do not attempt both.

**Exit:** the four checks in §8.7 pass.

## 7. Conventions

- TypeScript strict; no `any` in the socket layer
- Zod validation on every inbound socket payload and HTTP body
- Structured JSON logs (pino) with a request/socket correlation ID
- Config via env vars only; a committed `.env.example`
- Vitest for pagination cursors, ULID ordering, and the optimistic-update reducer
- Commit per phase with a message naming the exit criterion met
- Keep `docs/decisions.md`: one short entry per non-obvious choice and its alternative

## 8. RAG: `@bot` over room history

### 8.1 What it does

A user types `@bot what did we decide about the deployment window?` in a room. The system
finds the handful of past messages in that room most semantically related to the question,
sends only those to an LLM, and streams the answer back into the room as a message from a
bot user, with citations linking to the source messages.

The value over keyword search: someone may have written "let's push to prod Tuesday night",
which contains none of the query's words but is exactly the right answer.

### 8.2 What it is NOT

There is **one** bot service and **one** embeddings table. There is no bot object per room,
no per-room index, no per-room process. A room is a `WHERE room_id = $1` clause at query
time. Build it any other way and it will not scale past a few hundred rooms.

### 8.3 Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE message_embeddings (
  message_id  TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  room_id     TEXT NOT NULL REFERENCES rooms(id),   -- denormalised on purpose, see 9.5
  embedding   vector(1536) NOT NULL,
  model       TEXT NOT NULL,                        -- so a model swap is detectable
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_embeddings_hnsw ON message_embeddings
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_embeddings_room ON message_embeddings (room_id);

-- keyword arm of the hybrid search
ALTER TABLE messages ADD COLUMN body_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;
CREATE INDEX idx_messages_tsv ON messages USING gin (body_tsv);

-- per-room config: a table, not an instance
CREATE TABLE room_bot_config (
  room_id       TEXT PRIMARY KEY REFERENCES rooms(id),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  system_prompt TEXT,
  top_k         INT NOT NULL DEFAULT 10
);
```

Chunking: one message = one chunk. Chat messages are already short. Skip messages under
~15 characters ("ok", "thanks") — they add noise and cost. For PDF attachments (8.8),
chunk at ~500 tokens with ~50 token overlap.

### 8.4 Indexing pipeline

Reuse the Phase 4 machinery. Add an `embed` queue to BullMQ. After the persist worker
writes a message, it enqueues an embed job. A separate embed worker batches up to 100
messages per API call, then upserts into `message_embeddings`.

Rules:
- The socket path never calls an embedding API. Ever.
- Backfill the seeded history with a one-off script that reuses the same worker code.
- Failed embed jobs retry with exponential backoff; a permanently failed message stays
  searchable by keyword, so degradation is partial rather than total.

### 8.5 Retrieval — hybrid

Three modes, all implemented, selectable by env var so they can be benchmarked:

```sql
-- vector arm
SELECT m.id, m.body, m.sender_id, m.created_at,
       1 - (e.embedding <=> $2::vector) AS score
FROM message_embeddings e
JOIN messages m ON m.id = e.message_id
WHERE e.room_id = $1                    -- filter BEFORE the search, never after
ORDER BY e.embedding <=> $2::vector
LIMIT 50;

-- keyword arm
SELECT id, body, sender_id, created_at,
       ts_rank(body_tsv, plainto_tsquery('english', $2)) AS score
FROM messages
WHERE room_id = $1 AND body_tsv @@ plainto_tsquery('english', $2)
ORDER BY score DESC
LIMIT 50;
```

Fuse the two ranked lists with Reciprocal Rank Fusion: `score = Σ 1 / (60 + rank_i)`.
Take the top `top_k` after fusion.

**Security, non-negotiable:** the `room_id` filter goes in the SQL `WHERE` clause, and the
asker's membership is verified against `room_members` before the query runs. Filtering
after a top-k vector search leaks the existence of content in rooms the user cannot see.
Write a test for this.

### 8.6 Generation and streaming

1. Verify membership, check `room_bot_config.enabled`, rate-limit per user
2. Embed the question (cache identical questions per room in Redis, 5 min TTL)
3. Retrieve and fuse
4. Build the prompt: retrieved messages with sender and timestamp, then the question, then
   an instruction to answer only from the provided messages and to say so plainly when they
   do not contain the answer
5. Stream tokens over the existing socket; persist the final text as a normal message from
   the bot user so it appears in history and scrollback like any other

New socket events:

```ts
// ServerToClient
'bot:token':    (p: { queryId: string; token: string }) => void;
'bot:complete': (p: { queryId: string; messageId: string; citations: string[] }) => void;
'bot:error':    (p: { queryId: string; message: string }) => void;
```

Citations are message IDs. The client renders them as chips that scroll the virtuoso list
to that message.

### 8.7 Exit criteria

1. Ask a question whose answer is phrased with none of the query's words; the bot finds it
2. A user not in a room cannot retrieve its messages — verified by an automated test
3. Ingesting 10k messages produces 10k embeddings with the socket layer's event loop lag
   unchanged (compare against the Phase 7 baseline)
4. Every answer carries citations, and each citation links to a real message in that room

### 8.8 Retrieval evaluation — this is the graded part

Build a small labelled set: 30 questions over the seeded history, each with the message IDs
that genuinely answer it. Then measure all three modes:

| Mode | recall@10 | MRR | p95 latency |
|---|---|---|---|
| Keyword only | | | |
| Vector only | | | |
| Hybrid (RRF) | | | |

Add to `docs/benchmarks.md`. Also record embedding cost per 1k messages and index size.
The expected finding — hybrid beats both arms, keyword wins on exact names and IDs, vector
wins on paraphrase — is worth stating and then confirming or refuting with your numbers.

### 8.9 Optional extension

If the PDF path is quick: chunk uploaded documents in the same embed worker, store chunks
in a parallel `document_chunks` table with the same room filter, and let the retrieval
step draw from both tables. Same pipeline, one extra source.

## 9. If time remains

In this order, only after Phase 8 is done:
1. **Connection state recovery** — Redis Streams adapter with `connectionStateRecovery`
   and a 30s `maxDisconnectionDuration`. Note the hazard: recovery pulls stream history
   into the V8 heap per client, so a reconnect storm can OOM the process. Mitigate with a
   short window plus ingress rate limiting.
2. Postgres range partitioning by month on `messages` + `pg_partman`, with an
   `EXPLAIN ANALYZE` showing partition pruning
3. Web Push with VAPID keys for closed-tab notifications
4. Dexie.js/IndexedDB offline outbox

## 10. Working agreement for the implementer

- Ask before adding a dependency not listed in §2.
- If a phase's exit criterion cannot be met, stop and report why rather than moving on.
- Prefer the boring solution. This project is graded on measured behaviour and on the
  clarity of its reasoning, not on the novelty of its stack.
