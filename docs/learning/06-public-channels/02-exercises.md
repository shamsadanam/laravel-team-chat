# 06 · Exercises

Setup for every exercise: **Ada** in a normal window, **Linus** in a private window, both on `/rooms/general`.

---

## 06.1 🟢 The event

1. `lerd artisan make:event MessagePosted --no-interaction`
2. Implement it as in lesson §1 (`ShouldBroadcastNow`, `rooms.{id}`, `message.posted`, `broadcastWith` using `MessageResource`).
3. Dispatch it from `MessageController@store` with `broadcast(...)` (no `toOthers()` yet).

**Done when** Ada sends a message and Linus's WS Messages tab shows a `message.posted` frame on `rooms.1` whose `data` matches `MessageResource`'s shape.

<details><summary>Hint: the frame isn't there</summary>

Linus isn't subscribed yet. You'll add the listener in 06.2. Until then, verify with Reverb's debug output (module 05 §8), or subscribe from the console: `Echo` isn't global, so use a temporary `useEchoPublic` with a `console.log`.
</details>

---

## 06.2 🟢 Live messages

In `rooms/Show.vue`:
1. Keep a local `messages` ref seeded from props, re-synced when props change.
2. Listen with `useEchoPublic` on `rooms.${room.id}` for `.message.posted` and append, with dedupe.
3. Auto-scroll to the bottom when a message is added.

**Done when** Ada posts → Linus sees it instantly, and Linus posts → Ada sees it. Navigating to another room and back still works.

<details><summary>Hint: auto-scroll</summary>

A template ref on the list container, then after pushing: `await nextTick(); el.value?.scrollTo({ top: el.value.scrollHeight })`. Better: only auto-scroll if the user was already near the bottom. Don't yank them away from history they're reading.
</details>

---

## 06.3 🟢 `toOthers()` and the socket id

1. Add `->toOthers()`.
2. **Before** adding the interceptor, open Ada's WS tab: does Ada receive her own `message.posted` frame?
3. Add the `http.onRequest` interceptor from lesson §3.
4. Check again.

**Done when** the POST request carries `X-Socket-ID`, and Ada no longer receives her own frame (Linus still does).

<details><summary>Hint: why the dedupe hid the bug</summary>

Before the interceptor, Ada got her own message twice (redirect + socket), but your dedupe in 06.2 swallowed the duplicate. That's why you check the WS tab, not just the UI.
</details>

---

## 06.4 🟢 Live edits and deletes

1. `MessageUpdated` (`message.updated`, full message payload) and `MessageDeleted` (`message.deleted`, payload `{ id }`, constructor takes plain ints).
2. Dispatch from `update` and `destroy` with `toOthers()`.
3. Listen for both on the room page. Replace or remove by id.

**Done when** Linus edits his message and Ada sees the new text; Ada (owner) deletes it and it disappears for Linus.

<details><summary>Hint: one hook, many events</summary>

`useEchoPublic` accepts an array of event names, but then one callback gets all payload shapes. Three separate hooks on the same channel name are clearer and still share a single subscription.
</details>

---

## 06.5 🟡 Fix the permissions leak

1. Log in as Linus. Have Ada post. Does Linus see Edit/Delete on Ada's live message? (If 04.5's `can` flags are in `MessageResource`: yes, wrongly.)
2. Remove `can` from `MessageResource`.
3. Compute `canEdit` and `canDelete` in Vue from `auth.user.id`, `message.author.id` and the room's `owner_id` (add it to the `room` prop).
4. Keep the server-side policies exactly as they are.

**Done when** live and loaded messages show the right buttons for each viewer, and a forged PATCH still gets 403.

<details><summary>Hint</summary>

This duplicates the policy's logic in TypeScript. That's acceptable for *display*, because the policy remains the source of truth for *enforcement*. Keep the TS version small and name it to match: `canDeleteMessage(message, room, user)`.
</details>

---

## 06.6 🟡 Exploit your own app

Grace is **not** a member of `dev` (module 02 seeder). Prove that public channels leak:

1. Find `dev`'s room id (tinker).
2. Logged in as Grace (or not logged in at all), use the raw-socket trick from 05.7 to subscribe to `rooms.<dev id>`.
3. As Ada, post in `dev`.

**Done when** Grace's console prints a message from a room she's not allowed to read. Write one sentence on why the `RoomPolicy` from module 04 didn't stop this.

---

## 06.7 🔴 Pin a message with an anonymous event

Add a "📌 pin message" feature: the owner can pin a message; everyone in the room sees the pinned banner update live. Use an **anonymous event** (`Broadcast::on(...)->as('message.pinned')->with([...])`) instead of a class. Then write two sentences on when you'd turn it into a class.

**Done when** pinning updates the banner for everyone in the room.

<details><summary>Hint</summary>

Store `pinned_message_id` on `rooms` (new migration). The anonymous event's `with()` payload should be the same `MessageResource` shape, or `null` for "unpinned".
</details>
