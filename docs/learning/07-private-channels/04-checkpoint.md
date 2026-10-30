# 07 · Checkpoint

1. What does Reverb require before subscribing a socket to `private-rooms.3`, and who can produce it?
2. List the steps from `useEcho('rooms.3', …)` to `subscription_succeeded`.
3. How does `/broadcasting/auth` know who the user is?
4. You write `Broadcast::channel('rooms.{room}', fn (User $user, Room $room) => …)`. Which subscription names does it match?
5. Why reuse `RoomPolicy::view` in the channel callback?
6. Grace is removed from `dev` while viewing it. Does she stop receiving immediately? What do you do about it?
7. Members get 403 on `/broadcasting/auth`. Name three causes.
8. Why does `membership.changed` *not* use `toOthers()`?

<details><summary>Answers</summary>

1. An `auth` signature: an HMAC of `socket_id:channel` with the app secret. Only the Laravel app (which holds the secret) can make it, and it does so only after your callback approves.
2. Echo prefixes `private-` → POST `/broadcasting/auth` with `socket_id` + `channel_name` and the session cookie → Laravel matches the pattern, binds models, runs the callback → 200 with `auth` → Echo sends `pusher:subscribe` with `auth` → Reverb verifies → `subscription_succeeded`.
3. It's in the `web` middleware group, so the session cookie is loaded and `$request->user()` works as on any page.
4. `private-rooms.N` and `presence-rooms.N`.
5. One rule for "may see this room" across pages, forms and sockets. Change it once and everything follows.
6. No. Authorization runs only at subscribe time. Send a `membership.changed`/revoked event on her user channel so the client leaves the channel, and keep enforcing every write and read with policies.
7. Not logged in (session missing); the callback returned false; a pattern typo or wrong binding name; an exception thrown in the callback.
8. The same user's other tabs have different sockets and *should* update. `toOthers()` only skips the requesting socket, and the requesting tab redirects anyway.
</details>
