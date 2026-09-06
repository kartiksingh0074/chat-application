# UI plan — sequenced, with a cutoff before Phase 8

Supersedes the menu-style draft of this file (see `git show 72e8447` for that version).
Nothing below is built unless marked ✅. Effort: **S** = under an hour, **M** = a few hours,
**L** = a session or more.

Framing: PROJECT.md §1 calls this "a scalability study, not a feature-complete messenger", and
§8.8 says the RAG evaluation "is the graded part". Phase 8 is still entirely unbuilt and is what
the resume describes. So this plan deliberately stops short of a full Discord clone — §4 lists
what got deferred and why.

---

## 0. Corrections to the previous draft

Two things the earlier draft got wrong, found by reading the code rather than the doc.

**The DM naming fix is not client-side.** The draft said to "derive the title from the other
member" in the client. That works for the *header* but not the *sidebar*: `GET /rooms`
(`server/src/rooms/routes.ts:12`) returns only `{id, name, isDirect}`, and `useMembers`
(`client/src/hooks/useMembers.ts`) loads members for the **active room only**. The sidebar lists
every DM but holds member data for at most one of them, so deriving client-side means an N+1
`/rooms/:id/members` fetch per DM on every page load. The fix belongs on the server: `GET /rooms`
returns a `peer` for direct rooms. No migration — one extra join.

The same bug hits the avatar: `Sidebar.tsx:51` does `<Avatar name={room.name} />`, so a DM avatar
shows initials derived from `"alice & bob"` — an "A" for both participants.

**Jump-to-message needs a new query mode, not just client plumbing.**
`buildMessagesPageQuery` (`server/src/rooms/messagesQuery.ts`) only supports `before`
(`id < cursor`, descending). A citation chip needs the page *surrounding* an arbitrary message —
rows both newer and older than the target. That is a second query shape, not a parameter tweak.
Detail in Stage D.

---

## 1. Open questions — decided

The five questions from the previous draft, answered. All reversible.

1. **Server rail — skip.** There is exactly one "server", so the far-left icon column would be
   decoration that costs horizontal space on a laptop screen. Collapsible sidebar sections give
   most of the same visual rhythm for less.
2. **Emoji picker — skip.** It is the one item needing a new dependency (§10 requires asking),
   the good libraries are large, and the OS picker already works in the composer. Revisit only if
   it turns out to matter.
3. **Density toggle — pick one default (cozy).** Building both doubles the CSS surface on every
   message row for a preference that does not show up in a demo.
4. **Ordering — correctness first, then the look.** The DM naming bug is visible in every
   screenshot of the DM list, and dead links read as broken. Fixing those is cheap and raises the
   floor before styling lands on top.
5. **Cutoff — Stages A–D below, then Phase 8.** Everything in §4 is deferred.

---

## 2. What ships (Stages A–D)

### Stage A — Correctness. These are bugs, not features. ✅ Done

- [x] **DM naming, server side** — add `peer: {id, username}` to `GET /rooms` for `isDirect` rooms,
  and to the `POST /rooms/dm` response (both the created and the get-or-create branch, which today
  returns the stored name at `rooms/routes.ts:135`). Leave the stored `name` column alone; it stops
  being used for display. **S–M**
- [x] **DM naming, client side** — `Room` type grows `peer?`. `Sidebar.tsx:51,57`, `RoomHeader`, and
  the composer placeholder (`ChatPage.tsx:142`) render `room.peer?.username ?? room.name`. Fixes the
  wrong avatar initials in the same change. **S**
- [x] **Error boundary** — there is no `componentDidCatch` anywhere in `client/src`; a single render
  error blanks the whole app. **S**
- [x] **Clickable links** — a pasted URL is dead plain text today. Autolink, with
  `rel="noopener noreferrer"`. Escape first; never render raw HTML. **S**
- [x] **Message length counter** — the server rejects over 4000 chars (`socket/handlers.ts:22`); the
  UI gives no warning, so a long paste fails silently. **S**
- [x] **Non-image attachments** — `Composer.tsx:62` hardcodes `accept="image/*"`. Allow other types
  and render a file card when the MIME type is not an image. **S**
- [x] **Drag & drop + paste to upload** — paste-an-image is the most-missed interaction. **S**

**Exit met.** Verified against the running stack: one stored row `"alice & bob"` returns
`peer: bob` to alice and `peer: alice` to bob. 45 tests pass (was 17).

### Stage B — The Discord shell. Cheap, high visual return. ✅ Done

- [x] **Dark-first palette retune** — neutral dark greys with a trace of blue; dark is now the
  default theme rather than following the OS. Needed one new token, `--color-surface-nav`: the
  sidebar has to sit *behind* the conversation, but this codebase's `surface-raised` is lighter
  than `surface`, so reusing it would have pushed the nav forward instead. **S**
- [x] **Right-hand member list panel** — online above offline, offline dimmed rather than hidden
  so the room still shows its true size. Visible from `xl` up; narrower screens keep the dialog. **M**
- [x] **Collapsible sidebar sections** — Rooms / Direct Messages, with counts. Collapsed state
  persists per section. **S**
- [x] **Scroll-to-bottom button + "N new messages" badge** — the count only tracks messages that
  arrive at the *end*: loading older history also grows the array, so comparing the last message id
  is what separates "new message" from "scrolled into the past". **S–M**
- [x] **Hover toolbar** — *copy only.* The jump-link half needs the Stage D `around` query, so it
  lands there. Reactions, replies and threads are banned by §1, so this stays a one-button toolbar
  until then. **M**
- [x] **Loading skeletons** — sidebar and message list, shaped like the content they replace.
  `useMessages` grew a `loading` flag so the message skeleton has something to key off. **S**
- [~] **Micro-animations** — dialog fade, modal pop, toolbar and jump-button entrance, hover
  transitions. **Message-enter animation deliberately skipped:** `react-virtuoso` recycles rows, so
  a CSS enter animation re-fires every time a message scrolls back into view. Discord does not
  animate message entry either. **S**

**Exit met.** 45 tests pass, `tsc` clean, CSS 21.65 → 24.41 kB.

### Stage C — People and presence

- [ ] **Global user search surface** — `GET /users?q=` already exists (`server/src/users/routes.ts`,
  `ilike` match, excludes the caller) and is used inside dialogs. This promotes it to a first-class
  panel: search, preview, start a DM from the result. Mostly UI. **M**
- [ ] **User popout card** — click an avatar for name, join date, "Message" button. Reuses the search
  result row. **M**
- [ ] **Avatar upload** — `avatar_key` on `users`; reuses the Phase 6 MinIO presign pipeline
  end-to-end. Generated initials stay as fallback. Migration is one column. **M**
- [ ] **Typing indicators** — `typing:start` / `typing:stop`, Redis-backed so it crosses
  node-1/node-2. Worth doing *because* it exercises the Redis adapter across instances, which is the
  project's whole point — the one "feel" feature that is also architecturally on-topic. **M**

**Exit:** you can find any user in the DB and start talking to them without knowing their exact name.

### Stage D — Phase 8 prerequisites. Not optional; §8.6 requires them.

- [ ] **`around` pagination mode** — extend `buildMessagesPageQuery` with a third shape: `limit/2`
  rows `id >= target` ascending, `limit/2` rows `id < target` descending, merged. Same
  `idx_messages_room_id_desc` index, still no OFFSET. **M**
- [ ] **Jump-to-message** — citation chip scrolls the virtuoso list to the cited message, fetching the
  surrounding page first when it is not loaded, then briefly highlighting it. **M**
- [ ] **Bot message styling** — distinct treatment plus citation chips. **S**
- [ ] **Streaming token rendering** — `bot:token` appends progressively without re-rendering the list. **M**

**Exit:** verifiable only once Phase 8 exists, so Stage D lands immediately before it and is
validated by §8.7 criterion 4.

---

## 3. Then Phase 8

Unchanged from PROJECT.md §8. The parts most likely to bite, flagged now:

- **§8.5 security is testable and graded** — the `room_id` filter goes in the SQL `WHERE`, and
  membership is checked *before* the query. Filtering after a top-k vector search leaks the existence
  of content in rooms the user cannot see. §8.7 criterion 2 requires an automated test for exactly this.
- **§8.4** — the socket path never calls an embedding API. Embedding goes through a new BullMQ queue
  alongside the Phase 4 persist worker.
- **§8.8 is the graded deliverable** — 30 labelled questions, three retrieval modes, recall@10 / MRR /
  p95 into `docs/benchmarks.md`. This is what the resume claims and what is worth protecting time for.

---

## 4. Deferred — not deleted

Cut to protect Phase 8. Each is genuinely useful; none is on the critical path to a working demo.

| Item | Effort | Why it waits |
|---|---|---|
| Unread badges + new-message divider | **L** | Needs a `room_reads` table and read-tracking on every view; largest item on the list |
| Edit / delete messages | **M** | Needs `edited_at` / `deleted_at`; soft-delete so RAG citations do not break |
| Markdown formatting | **M** | Escaping has to be exactly right; a bad regex here is an XSS hole |
| @mention highlighting | **M** | Wants the mention stored, not just parsed, to be useful |
| Ctrl+K quick switcher | **M** | Genuinely nice; pure convenience |
| Room CRUD, add/remove members | **M** | You can create rooms but not leave, rename, or delete one |
| Richer presence (idle/DND) | **M** | Binary online/offline is honest; idle needs inactivity detection |
| Room topic, custom display name | **S** | Two more migrations for small return |
| Notification sound | **S** | Easy to add late |
| Emoji picker, density toggle, server rail | — | Decided against in §1 |

---

## 5. Out of scope — PROJECT.md §1

Reactions · Threads · Read receipts beyond delivered/sent · Voice / video · End-to-end encryption

---

## 6. Already done

- ✅ Signup / signin, logout, session persistence, token auto-refresh
- ✅ Real usernames, presence dots, create rooms, DMs (get-or-create), user picker
- ✅ Message timestamps, day separators, sender grouping, retry failed sends
- ✅ Settings dialog with light / dark / system themes
- ✅ Toasts, image lightbox, mobile drawer, Enter-to-send
