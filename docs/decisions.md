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

**`server/Dockerfile.worker` merged into a single `server/Dockerfile`.** Both the worker and the
app server (`node-1`/`node-2`) are the same image; only the container `command` differs
(`docker-compose.yml` overrides it for the `worker` service). Avoids maintaining two near-identical
Dockerfiles that would drift out of sync as the app grows.
