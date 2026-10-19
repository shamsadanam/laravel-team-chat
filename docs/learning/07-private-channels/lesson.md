# 07 · Private channels and channel authorization

**Goal:** close the hole you exploited in 06.6. Only members of a room can subscribe to its channel, and the rule is the same `RoomPolicy` you wrote in module 04.

**You'll touch:** `routes/channels.php`, `app/Broadcasting/`, your events, `rooms/Show.vue`.

---

## 1. What makes a channel private

A private channel is a channel whose name starts with `private-`. Reverb refuses to subscribe a socket to it unless the subscribe frame carries a **signature** that only your Laravel app can produce (it needs `REVERB_APP_SECRET`).

So the real question is: *when does Laravel agree to sign?* Only when your authorization callback says yes.

## 2. The authorization flow

```
Vue: useEcho('rooms.3', …)
  │  Echo knows useEcho = private → channel "private-rooms.3"
  ▼
Echo ──POST /broadcasting/auth──────────────────────▶ Laravel (web middleware: session → $request->user())
       { socket_id: "123.456", channel_name: "private-rooms.3" }
                                                        │ matches routes/channels.php pattern "rooms.{room}"
                                                        │ binds {room} → Room #3
                                                        │ runs your callback(User $user, Room $room)
                                                        │   true  → 200 { auth: "key:HMAC(secret, socket_id:channel)" }
                                                        │   false → 403
       ◀─────────────────────────────────────────────────┘
Echo ──pusher:subscribe { channel, auth }──▶ Reverb verifies the HMAC → subscription_succeeded
```

Points that matter:

- `/broadcasting/auth` is registered by `withRouting(channels: …)` in `bootstrap/app.php`, inside the **web** middleware group. The browser's session cookie identifies the user, exactly like a page request (module 04 §2). It's excluded from CSRF checks, so Echo doesn't need a token.
- **You write the pattern without the `private-` prefix.** `Broadcast::channel('rooms.{room}', …)` matches `private-rooms.3` and also `presence-rooms.3` (module 08).
- **Guests are rejected before your callback runs.** No user means 403.

## 3. Writing the rule

```php
// routes/channels.php
use App\Models\Room;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('rooms.{room}', function (User $user, Room $room) {
    return $user->can('view', $room);
});
```

- `{room}` + a `Room $room` type-hint = **channel model binding**, looked up by primary key. If the room doesn't exist, the callback is denied.
- Reusing the policy means one rule for "can see this room" across pages, forms **and** sockets. Change the policy and all three follow.

Your project already has one channel rule:

```php
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});
```

That's the **per-user channel**: only you can listen to `private-App.Models.User.{your id}`. Notifications (module 09) arrive there, and it's the right place for "something happened to *you*" events.

### Channel classes

When the callback grows, give it a class:

```bash
lerd artisan make:channel RoomChannel --no-interaction
```

```php
class RoomChannel
{
    public function join(User $user, Room $room): bool
    {
        return $user->can('view', $room);
    }
}
```

```php
Broadcast::channel('rooms.{room}', RoomChannel::class);
```

The container resolves the class, so constructor injection works.

## 4. Broadcasting on a private channel

```php
public function broadcastOn(): array
{
    return [new PrivateChannel('rooms.'.$this->message->room_id)];
}
```

On the client, `useEcho` is the private-channel hook:

```ts
useEcho<{ message: Message }>(`rooms.${props.room.id}`, '.message.posted', ({ message }) => { … });
```

Don't write `private-` yourself on either side. `PrivateChannel` and `useEcho` add it.

## 5. Authorization happens once

This catches many people out: **the callback runs only when subscribing.** Reverb doesn't re-check later. If Grace is removed from `dev` while her tab is subscribed, she keeps receiving `dev` messages until she disconnects or resubscribes.

How to deal with it:

1. **Tell the client to leave.** When membership is revoked, broadcast a `membership.revoked` event on the user's own channel (`App.Models.User.{id}`). The client calls `leaveChannel()` and navigates away. Cooperative clients handle this, and it's what you build in 07.5.
2. **Keep the window small.** For sensitive data, combine (1) with server-side checks on every write. Broadcasts only *display* data; the database stays the truth.
3. **Rotate the channel name** (e.g. include a membership version). Rarely worth the complexity.

For a chat app, (1) plus (2) is the standard answer.

## 6. Debugging channel auth

| Where | What you see |
| --- | --- |
| Network tab | `POST /broadcasting/auth` → **200** with `{"auth":"…"}`, or **403** |
| WS Messages | `pusher:subscribe` with an `auth` field → `pusher_internal:subscription_succeeded`, or `pusher:subscription_error` |
| `laravel.log` | Exceptions thrown inside your callback (e.g. a lazy-loading violation) show up here, not in the browser |

A **403** means: not logged in, the callback returned false, the binding found no model, or no pattern matched the name (a typo in `channels.php`).

## 7. Testing the rule quickly

`tinker` can't fake a socket, but the rule is just a policy, so check that:

```bash
lerd artisan tinker --execute '$g = App\Models\User::firstWhere("email","grace@example.com"); $r = App\Models\Room::firstWhere("slug","dev"); var_dump($g->can("view", $r));'
```

Module 12 tests `/broadcasting/auth` itself, and has a trap to watch out for.

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| 403 on `/broadcasting/auth` for a member | Pattern typo, wrong binding name (`{room}` vs `$roomId`), or an exception in the callback (check the log). |
| Works, then 403 after you switched events to `PrivateChannel` | Client still uses `useEchoPublic` → it subscribes to `rooms.3`, which now gets nothing. Use `useEcho`. |
| Callback returns true but nothing arrives | The event still broadcasts on a public `Channel`. Both sides must agree on the channel type. |
| Removed members keep receiving | Auth is only checked at subscribe time (§5). |
| `private-private-rooms.3` | You added the prefix by hand. |

## What you should be able to explain now

- What a private channel signature is, who can create it, and why.
- Every step of the `/broadcasting/auth` request.
- Why the channel rule reuses `RoomPolicy::view`.
- Why removing a member doesn't immediately stop their subscription, and what to do about it.
- How to diagnose a 403 on channel auth.

Next: [exercises](exercises.md).
