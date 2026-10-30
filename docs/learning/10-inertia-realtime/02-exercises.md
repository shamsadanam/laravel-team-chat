# 10 · Exercises

---

## 10.1 🟢 Reproduce the race

Before fixing anything, see the problem the 06-style local copy has:

1. In `MessageController@store`, temporarily add `sleep(3);` before `return back();`.
2. Ada sends a message. During the 3 seconds, Linus sends one.
3. Watch Ada's screen when her request completes.

**Done when** you can explain what Ada saw and why. (Does Linus's message stay? Did it flicker?) Remove the `sleep`.

<details><summary>Hint</summary>

Ada's `watch(() => props.messages, …)` replaces the whole local list with the server's list. Was Linus's message saved before or after Ada's request read the messages?
</details>

---

## 10.2 🟢 Prop helpers instead of a local copy

1. Remove the local `messages` ref and its `watch`.
2. Render `props.messages` directly.
3. Apply `message.posted`, `message.updated` and `message.deleted` with `router.replaceProp('messages', …)`.

**Done when** live messages, edits and deletes still work, there's no `ref` copy of messages in the component, and 10.1's scenario behaves.

---

## 10.3 🟢 Optimistic send

1. Use `form.optimistic(...)` to append a pending message with a temporary id and `pending: true`.
2. Style pending messages at 50% opacity with "sending…".
3. Clear the input **immediately** on send (don't wait for success), but restore the text if the request fails.

**Done when** your message appears instantly, turns solid when confirmed, and with a forced failure (temporarily `abort(500)` in `store`) it disappears and the text comes back in the input.

<details><summary>Hint: temporary ids</summary>

`-Date.now()` gives a negative number that can't collide with database ids. Type it: `type PendingMessage = Message & { pending?: true }`.
</details>

<details><summary>Hint: restoring text</summary>

Save `const draft = form.body` before resetting, and set `form.body = draft` in `onError` (validation) and `onHttpException`/`onNetworkError` (server and network failures). Check the visit callbacks list in the Inertia manual-visits docs.
</details>

---

## 10.4 🟢 Re-sync after reconnect

1. In the persistent layout, watch `useConnectionStatus()`. When it becomes `connected` *after* having been something else, reload `messages`, `rooms` and `notifications`.
2. Test: Ada and Linus in `general`. `lerd worker stop reverb`. Linus sends 3 messages (they save, since HTTP still works). `lerd worker start reverb`.

**Done when** Ada's screen shows all 3 messages within a couple of seconds of Reverb returning, without a manual refresh.

<details><summary>Hint: reloading props the page doesn't have</summary>

`only: ['messages']` on a page without a `messages` prop is harmless. The server just returns what exists. The layout doesn't need to know which page it's on.
</details>

---

## 10.5 🟡 Signal, don't push: room list counts

On `/rooms` (the list page), each room shows `messages_count` (from 02.7). Keep the counts live **without** subscribing the list page to every room's channel.

Design it first: which channel, which event, which payload, and push data or signal? Then build it.

**Done when** Linus posting in `general` bumps the count on Ada's `/rooms` page within a second, and 20 quick messages cause at most a handful of reloads.

<details><summary>Hint</summary>

The user channel already reaches everyone individually. But sending one event per member per message is a lot. An alternative: a lightweight private channel `rooms.activity.{userId}`… or accept a slightly stale count and reload on focus. There's no single right answer. Write down your trade-off.
</details>

---

## 10.6 🟡 Polling fallback

When the connection status is `failed`, poll `messages` every 5 seconds on the room page. Stop polling when the socket comes back.

**Done when** setting `VITE_REVERB_PORT` to a wrong port (restart Vite) still gives you messages every ~5s, with a small "live updates unavailable" notice.

Revert the port afterwards.

---

## 10.7 🔴 Load older messages

Show the latest 50 messages, and load older ones when the user scrolls to the top, using Inertia's infinite scroll (`Inertia::scroll()` + `<InfiniteScroll>`) with **cursor** pagination.

**Done when** scrolling up loads older pages without duplicating, live messages still append at the bottom, and the scroll position doesn't jump when older messages are prepended.

<details><summary>Hint</summary>

Read the infinite scroll docs on reverse mode (chat-style lists). The paginator ordering and the live-append path now both touch `messages.data`. Point your `replaceProp` at `messages.data`.
</details>
