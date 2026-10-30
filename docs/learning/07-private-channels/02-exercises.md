# 07 · Exercises

Users: Ada (all rooms), Linus (all rooms), Grace (not in `dev`).

---

## 07.1 🟢 Go private

1. Switch `MessagePosted`, `MessageUpdated` and `MessageDeleted` to `PrivateChannel`.
2. Add the `rooms.{room}` rule to `routes/channels.php`, reusing `RoomPolicy::view`.
3. Switch the room page from `useEchoPublic` to `useEcho`.

**Done when** live messages work again between Ada and Linus, and the Network tab shows a 200 `POST /broadcasting/auth` for `private-rooms.N`.

---

## 07.2 🟢 Re-run the exploit

1. Repeat 06.6 as Grace with the raw socket, now subscribing to `private-rooms.<dev id>` **without** an auth signature.
2. Then, logged in as Grace in the app, open the console and try:

```js
fetch('/broadcasting/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ socket_id: '1.1', channel_name: 'private-rooms.<dev id>' }),
}).then(r => console.log(r.status))
```

**Done when** the raw subscribe gets `pusher:subscription_error`, and the fetch returns **403**. Run the same fetch with `general`'s id: 200.

---

## 07.3 🟢 Channel class

Move the rule into `app/Broadcasting/RoomChannel.php` (`lerd artisan make:channel RoomChannel --no-interaction`) and register it.

**Done when** behavior is unchanged and `channels.php` has no closure for rooms.

---

## 07.4 🟡 "You were added to a room"

When a user joins a room (04.6), or someone adds them, their sidebar should update **in every open tab**, live.

1. Event `RoomMembershipChanged` on `PrivateChannel('App.Models.User.'.$user->id)`, name `membership.changed`, payload `{ room_id, action: 'joined' | 'left' }`.
2. In `AppLayout` (persistent, so it listens on every page): `useEcho` on `App.Models.User.${user.id}`, and on the event, refresh **only** the shared `rooms` prop.

**Done when** Grace has two tabs open, joins `dev` in one, and the other tab's sidebar shows `dev` without a reload.

<details><summary>Hint: refreshing one prop</summary>

`router.reload({ only: ['rooms'] })`. It's a partial reload: the server runs only the `rooms` closure from `share()` (that's why you made it a closure in 01.5). Module 10 goes deeper.
</details>

<details><summary>Hint: guests</summary>

The layout also renders on `/login`? Then `auth.user` is null. Only subscribe when there's a user. Since hooks must be top-level, put the listener in a small child component rendered with `v-if="page.props.auth.user"`.
</details>

---

## 07.5 🟡 Revoke access live

1. When a member leaves (or is removed from) a room, also send `membership.changed` with `action: 'left'`.
2. If that user is currently viewing that room, they should be redirected to `/rooms` with a toast "You no longer have access to #dev", and their room channel subscription must be left.
3. Prove the subscription is gone: after removal, have Ada post in `dev`, and check Grace's WS tab shows **no** frame.

**Done when** step 3 passes.

<details><summary>Hint</summary>

Navigating away from `rooms/Show` unmounts it, and `useEcho` leaves the channel on unmount. So `router.visit('/rooms')` is enough to unsubscribe. Check it in the WS tab: you should see `pusher:unsubscribe`.
</details>

---

## 07.6 🟡 Which rule fired?

Add a second channel for room **owners only**: `rooms.{room}.admin`, carrying an event `MemberJoined` (who joined, for the owner's dashboard). Linus subscribing to `general`'s admin channel must get 403.

**Done when** Ada (owner) receives `member.joined` when Grace joins `dev`, and Linus's attempt to subscribe gets a 403.

<details><summary>Hint: pattern order</summary>

`rooms.{room}` and `rooms.{room}.admin` are different patterns. `{room}` matches one segment and doesn't swallow `.admin`. Still, test both names explicitly.
</details>

---

## 07.7 🔴 Forge a signature (and see why you can't)

1. Read `vendor/laravel/framework/src/Illuminate/Broadcasting/Broadcasters/PusherBroadcaster.php` and find how the `auth` string is built.
2. In tinker, compute a valid signature for socket `1.1` and `private-rooms.<dev id>` using `config('broadcasting.connections.reverb.secret')`.
3. Explain in two sentences why a browser can't do step 2, and what *does* stay secure if the secret ever leaked.

**Done when** your tinker signature equals the `auth` returned by `/broadcasting/auth` for the same socket id and channel (use Ada's session).

<details><summary>Hint</summary>

`hash_hmac('sha256', "{$socketId}:{$channel}", $secret)`, prefixed with `"{$key}:"`.
</details>
