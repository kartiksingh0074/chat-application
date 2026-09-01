# UI Roadmap — features to finalize before building

Working document. Tick what you want, strike what you don't, add anything missing. Nothing
here is built yet unless marked ✅ Done. Effort is rough: **S** = under an hour, **M** = a few
hours, **L** = a session or more.

Scope note: PROJECT.md §1 calls this "a scalability study, not a feature-complete messenger"
and §10 says ask before adding dependencies. Everything below is a deliberate departure from
that framing for demo/portfolio value — worth being intentional about how far we take it.

---

## 1. Confirmed requests (from you, this round)

- [ ] **Fix DM naming** — **S**, but it's a real design flaw, not just cosmetic.
  The server stores a DM's `name` as `"alice & bob"`, which is wrong for *both* participants:
  alice should see **bob**, and bob should see **alice**. Fix client-side — for `isDirect`
  rooms, derive the title from the other member rather than using the stored name — so one
  stored row renders correctly for everyone. (Storing a per-viewer name would need a row per
  viewer; deriving is strictly better.)
- [ ] **Global user search / discovery** — **M**. `GET /users?q=` already exists and is used
  inside dialogs. This makes it a first-class surface: search everyone in the DB, see a profile
  preview, start a DM from the result. Possibly a dedicated "Find people" panel.
- [ ] **Discord-style UI direction** — **L**. Broken down in §4 below.
- [ ] **Quick wins bundle** — §2 below.

---

## 2. Quick wins (no database migration)

- [ ] **Clickable links in messages** — **S**. Currently a pasted URL renders as dead plain
  text. Autolink URLs, `target="_blank"` + `rel="noopener noreferrer"`.
- [ ] **Typing indicators** — **M**. New `typing:start` / `typing:stop` socket events, Redis-
  backed so it works across node-1/node-2. Renders as "alice is typing…" above the composer.
- [ ] **Scroll-to-bottom button** — **S**. With an "N new messages" badge when scrolled up.
  Needs care with `react-virtuoso`'s `atBottomStateChange`.
- [ ] **Drag & drop + paste to upload** — **S**. Today you must click 📎. Paste-an-image is the
  one people miss most.
- [ ] **Non-image attachments** — **S**. The picker is hardcoded to `accept="image/*"`. Allow
  PDFs/docs and render a file card instead of an `<img>` when the type isn't an image.
- [ ] **Leave / rename / delete room** — **M**. You can create rooms but never get rid of one.
  Needs `DELETE /rooms/:id`, `PATCH /rooms/:id`, `DELETE /rooms/:id/members/:userId`.
- [ ] **Add & remove members** — **M**. The member list is read-only today.
- [ ] **Ctrl+K quick switcher** — **M**. Fuzzy jump between rooms and DMs.
- [ ] **Message length counter** — **S**. Server rejects over 4000 chars; the UI gives no warning.
- [ ] **Loading skeletons** — **S**. Replace bare spinners in the sidebar and message list.
- [ ] **Error boundary** — **S**. A render error currently blanks the entire app.

---

## 3. Needs a database migration

- [ ] **Avatar upload + profile page** — **M**. Add `avatar_key` to `users`; reuses the MinIO
  presign pipeline built in Phase 6. Biggest single visual upgrade. Replaces the generated
  initials avatars (which stay as the fallback).
- [ ] **Unread badges + "new messages" divider** — **L**. Needs a `room_reads` table
  (`room_id`, `user_id`, `last_read_message_id`). Bold room names, count badges, and the red
  unread line Discord shows.
- [ ] **Edit / delete messages** — **M**. Needs `edited_at` and `deleted_at` on `messages`.
  Deletion should be soft, so history and RAG citations don't break.
- [ ] **Room topic / description** — **S**. `description` column on `rooms`, shown in the header.
- [ ] **Custom display name** — **S**. `display_name` on `users`, separate from the login
  username.

---

## 4. Discord-style visual direction

This is the "make it feel live" item. Listed separately because each piece is optional — pick
the ones you actually want.

**Layout**
- [ ] **Right-hand member list panel** — **M**. Online members grouped above offline, always
  visible on wide screens. Very recognisably Discord.
- [ ] **Collapsible sidebar sections** — **S**. Rooms / Direct Messages as collapsible groups.
- [ ] **Server rail (far-left icon column)** — **S–M**. Visually iconic, but we only have one
  "server", so it may be decoration. Worth deciding deliberately.

**Message area**
- [ ] **Hover toolbar on messages** — **M**. Appears on hover at the message's top-right.
  Note: react/reply/thread are all out of scope per §1, so realistically this holds
  copy / edit / delete / jump-link only.
- [ ] **User popout card** — **M**. Click an avatar → small card with name, join date, and a
  "Message" button.
- [ ] **Compact vs cozy density toggle** — **S**. A settings preference.
- [ ] **Markdown-ish formatting** — **M**. `**bold**`, `*italic*`, `` `code` ``, and fenced
  code blocks. Needs careful escaping — do *not* render raw HTML.
- [ ] **@mention highlighting** — **M**. Parse `@username`, highlight it, and tint the whole
  message when you're mentioned.
- [ ] **Emoji picker** — **M**. Likely a new dependency — needs approval per §10.

**Feel**
- [ ] **Dark-first palette retune** — **S**. Shift the default toward Discord's darker greys;
  tokens already exist in `index.css`, so this is mostly value changes.
- [ ] **Richer presence states** — **M**. online / idle / do-not-disturb / offline instead of
  the current binary. Idle needs client-side inactivity detection.
- [ ] **Notification sound + in-tab browser notification** — **S**. (True Web Push is §9
  stretch territory — different thing.)
- [ ] **Micro-animations** — **S**. Message enter, hover transitions, dialog fade.

---

## 5. Prerequisites for Phase 8 (RAG bot)

These aren't optional if we build Phase 8 — §8.6 explicitly requires them:

- [ ] **Jump-to-message** — **M**. Citation chips must scroll the virtuoso list to the cited
  message. That plumbing doesn't exist and is non-trivial: the target may not be loaded, so it
  needs "fetch the page containing message X" support on the cursor endpoint.
- [ ] **Bot message styling** — **S**. Bot answers need to look distinct, with citation chips.
- [ ] **Streaming token rendering** — **M**. `bot:token` events append progressively.

---

## 6. Explicitly out of scope (PROJECT.md §1)

Listed so nobody re-proposes them later:

- ❌ Reactions
- ❌ Threads
- ❌ Read receipts beyond delivered/sent
- ❌ Voice / video
- ❌ End-to-end encryption

---

## 7. Already done

- ✅ Signup / signin pages, logout, session persistence, token auto-refresh
- ✅ Real usernames (was showing raw ULIDs)
- ✅ Presence dots (server had broadcast these since Phase 5; client now listens)
- ✅ Create rooms, direct messages (get-or-create), user picker
- ✅ Message timestamps, day separators, sender grouping
- ✅ Retry failed sends
- ✅ Settings dialog with light / dark / system themes
- ✅ Toasts, image lightbox, mobile drawer, Enter-to-send

---

## 8. Open questions to settle before building

1. **Server rail** — include the far-left icon column even though there's only one server, or
   skip it as pure decoration?
2. **Emoji picker** — worth a new dependency, or skip?
3. **Density toggle** — build both compact and cozy, or just pick one good default?
4. **Ordering** — quick wins first, or the Discord look first? (The look is more visible in a
   demo; the quick wins fix things that are actually broken, like dead links.)
5. **Where does this stop?** Phase 8 is still unbuilt and is the graded centrepiece. Worth
   agreeing a cutoff here so UI work doesn't consume its time.
