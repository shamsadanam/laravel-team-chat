# 08 · Exercises

Three windows help here: Ada (normal), Linus (private window), Grace (another browser or profile).

---

## 08.1 🟢 Presence auth

1. Change `RoomChannel::join` to return `['id', 'name']` or `false`.
2. Switch the three message events to `PresenceChannel`.
3. Switch the room page from `useEcho` to `useEchoPresence`.

**Done when** live messages still work, and the `/broadcasting/auth` response for `presence-rooms.N` contains `channel_data` with your id and name, and nothing else.

---

## 08.2 🟢 "Here now" list

Show the members currently viewing the room, in a sidebar on the right: name + green dot. Include yourself (from `auth.user`) at the top as "You".

**Done when** Linus opening `general` appears in Ada's list within a second, closing his tab removes him (it may take a few seconds), and opening a second Linus tab doesn't list him twice.

<details><summary>Hint: duplicates</summary>

On `joining`, only push if `!here.value.some(m => m.id === member.id)`.
</details>

---

## 08.3 🟢 Typing indicator

1. On input in the composer, whisper `typing` with `{ id, name }`, **at most once every 2 seconds**.
2. On receiving `typing`, show "Linus is typing…" under the list. Hide it after 4 seconds without a new whisper.
3. When a `message.posted` arrives from that user, hide their indicator immediately.
4. Several people typing: "Linus and Grace are typing…"; three or more: "Several people are typing…".

**Done when** all four behave correctly, and the WS tab shows at most one `client-typing` frame per 2 seconds while you type continuously.

<details><summary>Hint: throttle</summary>

Keep `let lastWhisperAt = 0`. In the input handler: `if (Date.now() - lastWhisperAt < 2000) return;`, then whisper and update it. No library needed.
</details>

<details><summary>Hint: per-user timers</summary>

`const typers = ref(new Map<number, { name: string; timer: ReturnType<typeof setTimeout> }>())`. On each whisper: clear that user's old timer and set a new one that deletes them. Since `Map` mutations need reactivity, either replace the map or use `reactive(new Map())`.
</details>

---

## 08.4 🟡 Who's online (app-wide)

1. A global presence channel `online` (any logged-in user).
2. Join it in the persistent layout, through a child component that only renders when logged in (as in 07.4).
3. Show a green dot next to online users wherever their name appears: message authors and the members list.

**Done when** Grace logging in makes her dot go green in Ada's window on any page, and it stays connected when Ada navigates between rooms (the WS tab shows no unsubscribe/resubscribe for `presence-online`).

<details><summary>Hint: sharing the online set</summary>

Put the online set in a small module-level store: `export const onlineUserIds = ref(new Set<number>())` in `resources/js/lib/presence.ts`. The layout listener writes to it; any component reads it.
</details>

---

## 08.5 🟡 Lie with a whisper

1. In Grace's console, find the presence channel and whisper `typing` with `{ id: <Ada's id>, name: 'Ada' }`.

   Since `Echo` isn't on `window`, add a dev-only helper for this: in `app.ts`, `if (import.meta.env.DEV) (window as any).echo = echo;`. Then `echo().join('rooms.1').whisper('typing', {...})`.
2. Observe: Linus sees "Ada is typing…".
3. Fix the *display* so a whisper only counts if its claimed `id` is in the presence member list **and** came from… think about whether you can know that.

**Done when** you've written 3–4 sentences on what Reverb guarantees about a whisper's sender, and what it doesn't.

<details><summary>Hint</summary>

With `accept_client_events_from = members`, Reverb guarantees the sender is *subscribed*. Is the original sender's `user_id` included in the relayed frame? Read `vendor/laravel/reverb/src/Protocols/Pusher/ClientEvent.php`.
</details>

---

## 08.6 🔴 Last seen

Record when a user was last in each room: a `last_seen_at` on `room_user`. Update it when they **load** the room page, and when they **leave** it (use a `beforeunload`-safe approach like `navigator.sendBeacon`, or update on the next request). Show "last seen 5 min ago" for members not currently present.

**Done when** it survives closing the tab, and you can explain why presence alone couldn't do it.
