# 99 · Design notes

One reasonable design per milestone. Compare with yours. If yours differs, check it against the same trade-offs rather than copying.

---

## M1 · Visibility

| | member | non-member |
| --- | --- | --- |
| **public** | view ✓, post ✓, leave ✓ (not owner) | view ✓ (read-only preview), join ✓ |
| **private** | view ✓, post ✓, leave ✓ (not owner) | view ✗, join ✗ |

- Read-only preview for public rooms is optional. If you allow it, the **channel rule must allow it too** (presence `join` returns user info for non-members of public rooms), or previewers won't get live updates. If you don't, the page and channel both deny. Keep them in sync by making both call `RoomPolicy::view`.
- `posting` stays members-only (`sendMessage`).
- Switching public → private: broadcast `room.visibility_changed` on the room's presence channel. Clients that aren't members (the client knows from shared data) leave and navigate away. The policy denies their next request regardless. Same reasoning as module 07 §5.
- Leaks: the browse query must filter `where visibility = public or id in (my rooms)`. Mentions (module 09) already notify members only.

---

## M2 · Invitations

- A **notification** (`database` + `broadcast`), because invitations need history and an unread state, and the bell already handles notifications.
- Accept → `RoomMembershipController@store` path (policy `join` extended: allowed if public, **or** a pending invitation exists for this user).
- Multi-tab: the 07.4 `membership.changed` event on the user channel already reloads `rooms` in every tab.
- Revoked eligibility: delete pending invitations when the room is deleted or the inviter loses ownership; the policy re-checks at accept time anyway.

---

## M3 · Unread counts

**Storage:** `room_user.last_read_message_id`. Unread for a room = messages with `id > last_read_message_id` and `user_id != me`.

**One query for the sidebar:**

```php
$request->user()->rooms()
    ->withCount(['messages as unread_count' => fn ($q) => $q
        ->whereColumn('messages.id', '>', DB::raw('coalesce(room_user.last_read_message_id, 0)'))
        ->where('messages.user_id', '!=', $request->user()->id)])
    ->get(['rooms.id', 'rooms.name', 'rooms.slug']);
```

(Check the generated SQL: the pivot table must be in scope for the subquery's `whereColumn`. If it isn't, use a correlated subquery with `selectSub`.)

**Live:** option (c) scales best: when a message is posted, a queued fan-out job sends a tiny `room.activity` (`{ room_id }`) on each member's user channel, and the client debounces `router.reload({ only: ['rooms'] })`. Cheaper still, with slightly less precision: increment the badge locally on `room.activity` and let the next reload correct it (module 09's "optimistic counter"). Option (b), the sidebar subscribing to N room channels, gets expensive with many rooms and means N authorizations per page load.

**Reading:** mark read on room page load **and** when a `message.posted` arrives while the room is visible and scrolled to the bottom (debounced `POST /rooms/{room}/read` with the latest id). Never move `last_read_message_id` backwards: `update … set last_read_message_id = greatest(coalesce(last_read_message_id, 0), ?)`.

**Multi-tab:** the read endpoint broadcasts `room.read` (`{ room_id }`) on the user's own channel **without** `toOthers()`; other tabs reload `rooms`.

---

## M4 · Direct messages

**Recommendation:** `rooms.type = 'direct'`, no name, exactly two members. You reuse messages, events, channels, presence, unread counts and almost all Vue. Policies gain a few `type` checks: no joining, no leaving (or "hide"), no invitations, no visibility.

**Uniqueness:** add `direct_key` (nullable, unique) = `min(user_a, user_b).'-'.max(user_a, user_b)`. Create through `Room::firstOrCreate(['direct_key' => $key], […])` and handle the race with the unique index (catch the duplicate, then fetch).

**Channel naming:** `rooms.{id}` is fine. Authorization (membership check) is the security; an unguessable name adds nothing when every subscription is signed only after the policy approves.

**Notify on DM:** in `MessageController@store`, for direct rooms, notify the other member with a `DirectMessageReceived` notification. Skip it if they're present in the room's presence channel? The server can't easily know; accept the notification, and have the client auto-mark it read if that DM is open.

---

## M5 · Reliability

Checklist per event:

| Question | Expected |
| --- | --- |
| Queued? | `ShouldBroadcast` (or `Now` + `ShouldRescue` for cosmetic signals) |
| After commit? | `ShouldDispatchAfterCommit` on anything dispatched near writes |
| Payload viewer-independent? | Yes |
| Leaked fields? | Leak test exists |
| Client idempotent? | Dedupe by id; tolerate unknown ids |
| Covered by reconnect re-sync? | The prop it modifies is in the reload list |

Deploy simulation: if a message is lost, it's almost always one of: a prop missing from the re-sync list, or a broadcast dispatched before commit.

---

## M6 · Hardening

Your `my-architecture.md` should let a new teammate answer, without reading code: *what channels exist, who may join each, what events flow on each, and what each payload looks like.* If writing it reveals an event you can't justify, delete the event.

---

## You're done when…

…you can take a feature request like "live polls in rooms" and, without looking anything up, decide: the data model, the routes and policies, push data vs signal, channel and event names and payloads, queueing and after-commit, the client listeners and where they live, the reconnect behavior, and the tests. That's what this course was for.
