# 05 · Checkpoint

1. Draw the path of an event from `::dispatch()` to a Vue callback. Label each hop's protocol.
2. Does Reverb load your models or run your policies when delivering an event? What does it actually receive?
3. In your `.env`, why is `REVERB_HOST=localhost` but `VITE_REVERB_HOST=laravel-reverb-example.test`?
4. Which Reverb credential is safe to put in browser JS, and which must never be?
5. You change `VITE_REVERB_PORT`. What must you do before the browser sees it?
6. You added `broadcastAs()` returning `room.updated`. What exact string do you pass to the listener?
7. `ShouldBroadcast` vs `ShouldBroadcastNow`: name one advantage of each.
8. The WS tab shows the event frame arriving, but your callback never fires. What are the two most likely causes?
9. Why must `useEcho…` hooks be top-level in `<script setup>`?

<details><summary>Answers</summary>

1. PHP `dispatch` → (HTTP POST, signed with the secret) → Reverb `/apps/{id}/events` → (WebSocket frame) → each subscribed browser → Echo parses it → callback.
2. No. It receives a channel name, an event name and a JSON payload, and fans them out to subscribers.
3. Laravel and Reverb run in the same container, so Laravel talks to it directly over HTTP on 8082. Browsers come from outside, through nginx on 443 with TLS, using the site's domain.
4. The app **key** is public. The **secret** never leaves the server.
5. Restart Vite (the lerd `vite` worker) or rebuild. `VITE_*` values are baked into the bundle.
6. `.room.updated`, with a leading dot.
7. `ShouldBroadcast`: the request doesn't wait for Reverb, and failures can retry. `ShouldBroadcastNow`: no queue worker needed, and delivery happens immediately in the request.
8. The event name doesn't match (namespace/dot), or you're listening on a different channel or channel type (public vs private).
9. They register cleanup with the component's lifecycle. Inside `onMounted` or a callback they can't unsubscribe on unmount, so they leak and duplicate.
</details>
