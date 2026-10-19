# 09 · Checkpoint

1. A `Room` with id 3 uses `BroadcastsEvents` and returns `[$this]` from `broadcastOn`. What channel and event name does a rename produce?
2. What do you need in `channels.php` for that to reach anyone?
3. Give one case where model broadcasting fits and one where an explicit event is better.
4. Why do model broadcasts and broadcast notifications need a queue worker, while your `MessagePosted` didn't?
5. `$user->notify(new MentionedInMessage($m))` with `via = ['database', 'broadcast']`: what happens, and on which channel does the live part arrive?
6. Where does the unread count come from on page load? What's the role of the live notification?
7. Why notify only room members when parsing mentions?
8. `Room::first()->touch()` broadcast a `RoomUpdated`. Why, and how do you stop it?

<details><summary>Answers</summary>

1. `private-App.Models.Room.3`, event `RoomUpdated` (listen with `.RoomUpdated`).
2. A rule for `App.Models.Room.{room}` (e.g. the `RoomChannel` class).
3. Fits: syncing a record's own fields to people viewing it (room name and description). Explicit event: domain actions with a chosen audience, such as "message posted" to a room, or "you were removed" to one user.
4. `BroadcastableModelEventOccurred` and `BroadcastNotificationCreated` implement `ShouldBroadcast` (queued). `MessagePosted` implements `ShouldBroadcastNow`.
5. A row is stored in `notifications` (from `toArray`), and a broadcast with the same data plus `id`/`type` goes to `private-App.Models.User.{id}`.
6. From the database (`unreadNotifications()->count()` in a shared prop). The live notification only increments it locally until the next load corrects it.
7. The excerpt and room name are room content. Notifying non-members would leak a private room to outsiders.
8. `touch()` saves `updated_at`, which fires `updated`. Return `[]` from `broadcastOn` unless `wasChanged([...])` covers meaningful fields.
</details>
