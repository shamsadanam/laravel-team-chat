# 09 · Exercises

Before you start: `lerd worker list` should show `queue` running. Remember `lerd artisan queue:restart` after editing PHP that the queue runs.

---

## 09.1 🟢 Rename a room live

1. Add an "edit room" form for owners: name and description (`PATCH /rooms/{room:slug}`, policy `update`: owner only).
2. Add `BroadcastsEvents` to `Room`, broadcasting `updated` and `deleted` on `[$this]`, with a `broadcastWith` that returns only `id, name, slug, description`.
3. Add the `App.Models.Room.{room}` channel rule.
4. On the room page, `useEchoModel` for `.RoomUpdated` updates the header.

**Done when** Ada renames `random` to `watercooler`, and Linus (viewing it) sees the new name in the header without a reload.

<details><summary>Hint: the slug</summary>

Should renaming change the slug? If yes, Linus's URL is now stale, and links built from the old slug 404. Decide: keep slugs stable (simplest), or redirect old slugs. Write down your choice.
</details>

---

## 09.2 🟢 Sidebar follows renames

Linus's sidebar still says `random`. Make it update too, **without** subscribing to every room's model channel from the layout.

**Done when** the sidebar shows the new name for every member of the room, on any page.

<details><summary>Hint</summary>

Who needs to know? Every member. Which channel reaches each member on any page? Their own user channel (07.4). Is model broadcasting the right tool for *that* audience? (Look again at the table in lesson §1.)
</details>

---

## 09.3 🟢 Mention notifications

1. `make:notifications-table`, migrate, `make:notification MentionedInMessage`.
2. `via`: database + broadcast. `toArray` as in the lesson.
3. In `MessageController@store`, parse `@Name` mentions (seeded names are single words) and notify **room members only**, excluding the sender.
4. In the layout, a bell with an unread count from a shared prop, incremented live by `useEchoNotification`.

**Done when** Ada writes "@Linus lunch?" in `general`, and Linus's bell goes from 0 to 1 instantly on whatever page he's on. Grace mentioned in `dev` gets nothing.

<details><summary>Hint: parsing</summary>

`preg_match_all('/@(\w+)/', $body, $matches)` → `$matches[1]`. Then `whereIn('name', …)` on `$room->members()`.
</details>

---

## 09.4 🟡 Notification menu

1. Clicking the bell opens a dropdown of the 10 latest notifications: "Ada mentioned you in #general: …lunch?".
2. Clicking one: mark it read and go to the room.
3. "Mark all read" button.
4. Newly arriving notifications appear at the top of an open dropdown.

**Done when** the count and the list stay correct across reloads, live arrivals and marking read in **another tab**.

<details><summary>Hint: other tab</summary>

Marking read in tab A doesn't tell tab B. Options: broadcast a small `notifications.read` event on the user channel and have tabs reload the prop, or accept the drift until the next navigation. Decide, and write one line on why.
</details>

<details><summary>Hint: loading the list</summary>

Don't share the list on every page. Load it only when the dropdown opens: an **optional** Inertia prop (`Inertia::optional(fn () => …)`) plus `router.reload({ only: ['notificationList'] })`, or a small JSON endpoint called with `useHttp`.
</details>

---

## 09.5 🟡 Model broadcasting gotcha

1. Run `lerd artisan tinker --execute 'App\Models\Room::first()->touch();'` while Linus watches the room.
2. What did Linus's client receive? Why?
3. Change `broadcastOn` so a save that changes only `updated_at` doesn't broadcast.

**Done when** `touch()` produces no frame, and a real rename still does.

<details><summary>Hint</summary>

Inside `broadcastOn`, `$this->wasChanged(['name', 'description'])` tells you whether something meaningful changed in the last save.
</details>

---

## 09.6 🔴 Custom notification channel name

Move user notifications from `App.Models.User.{id}` to `users.{id}`, using `receivesBroadcastNotificationsOn()` on `User`. Update the channel rule and every client listener.

**Done when** notifications and membership events still arrive, and the old channel pattern is gone from `channels.php`. Write one sentence on why someone would rename it.
