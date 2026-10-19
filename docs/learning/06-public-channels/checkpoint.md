# 06 · Checkpoint

1. Why name the channel `rooms.{id}` and not `rooms.{slug}` or one global `chat` channel?
2. What would the payload contain if you removed `broadcastWith()` from `MessagePosted`?
3. How does `toOthers()` know which connection to skip? Why doesn't it work out of the box with Inertia v3?
4. Why keep client-side dedupe even with `toOthers()` working?
5. Why copy `props.messages` into a `ref`, and why `watch` the prop?
6. Ada and Linus receive the same broadcast. Why can't it contain `can.delete`?
7. `MessageDeleted` takes `int $roomId, int $messageId` instead of `Message $message`. Why?
8. Grace read `dev` messages despite `RoomPolicy`. Which gate was missing?

<details><summary>Answers</summary>

1. Ids never change, but slugs can, which would strand subscribers. A global channel sends every message to every client, which wastes bandwidth and leaks data.
2. The raw serialized `Message` model: every column plus any loaded relationship (including the full `user`, and with it the email).
3. The browser sends its socket id in `X-Socket-ID`. Laravel passes it to Reverb as the socket to exclude. Echo only auto-adds that header to axios/jQuery/Turbo requests, and Inertia v3 uses its own HTTP client, so you add it with `http.onRequest`.
4. Same user, multiple tabs (different sockets); reconnects; races between the redirect reload and the socket. "Exactly once" is never guaranteed.
5. Props are read-only and represent the server's state at load time. The local copy can grow with live events, and the `watch` re-syncs it whenever the server sends fresh props.
6. A broadcast is one payload for all subscribers, and permissions differ per viewer. Each client derives its own display permissions; the server enforces them.
7. After deletion there's no row to reload, so a queued event with a model property would fail to restore it. And the UI only needs the id.
8. Channel authorization. Public channels never ask Laravel who may subscribe. Module 07.
</details>
