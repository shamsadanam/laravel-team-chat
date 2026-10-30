# 05 · Exercises

These use the demo you already have: `MessageSent` + `Welcome.vue` on the public `demo` channel. If module 01.6 redirected `/` away, add a temporary route: `Route::inertia('/demo', 'Welcome')`.

---

## 05.1 🟢 Watch the handshake

1. Open the demo page with DevTools → Network → **WS**.
2. Find the `/app/…` connection. Note its full URL, status code and the first three frames in **Messages**.
3. Answer: which host and port did the browser connect to? Which `.env` variables decided that?

**Done when** you can point at `pusher:connection_established`, `pusher:subscribe` (channel `demo`) and `pusher_internal:subscription_succeeded`, and name the variables behind the URL.

<details><summary>Hint</summary>

The URL contains `REVERB_APP_KEY`, not the secret. Compare host and port with the `VITE_REVERB_*` lines, not `REVERB_HOST`.
</details>

---

## 05.2 🟢 Fire an event by hand, watch every hop

1. Open the demo in **two** browser windows, consoles open.
2. In a terminal: stop the Reverb worker and run it in debug mode (lesson §8).
3. In another terminal: `lerd artisan tinker --execute 'App\Events\MessageSent::dispatch("hello from tinker");'`
4. Find the message in: the Reverb debug output, both windows' WS Messages tabs, and both consoles.

**Done when** you've seen the same payload in all three places. Restart the Reverb worker afterwards.

<details><summary>Hint: nothing in the browser</summary>

Walk the checklist in lesson §8 in order. Most likely: the tab isn't subscribed (hop 2), or the event name doesn't match (hop 5).
</details>

---

## 05.3 🟢 Payload shape

1. Add a second public property to `MessageSent`: `public string $from = 'tinker'`.
2. Add a **private** property: `private string $secret = 'nope'`.
3. Dispatch again and look at the frame's `data`.

**Done when** you can say which properties travel and why. Then remove `$secret`.

---

## 05.4 🟡 Custom event name

Give `MessageSent` a `broadcastAs()` returning `demo.message`. Update the listener so it still works.

**Done when** the console logs again, and you can explain why `useEchoPublic('demo', 'demo.message', …)` does **not** work.

<details><summary>Hint</summary>

Without a leading dot, Echo prefixes the namespace and listens for `App\Events\demo.message`.
</details>

---

## 05.5 🟡 Connection status badge

In the layout (or `Welcome.vue`), show a small badge with the live connection status from `useConnectionStatus()`: green for `connected`, amber for `connecting`/`reconnecting`, red otherwise.

Then break it on purpose: `lerd worker stop reverb`. Watch the badge. Start it again.

**Done when** the badge goes red or amber when Reverb stops and back to green on its own when it returns. Note how long reconnection takes.

---

## 05.6 🟡 Break it four ways

For each, predict the symptom **first**, then try it, then revert:

1. Set `VITE_REVERB_SCHEME=http` (restart the `vite` worker).
2. Listen for `MessageSent2` instead of `MessageSent`.
3. Change `MessageSent` to `ShouldBroadcast` (not `Now`) and stop the queue worker: `lerd worker stop queue`. Dispatch. Then start the worker.
4. Change `REVERB_APP_SECRET` in `.env` only (don't restart Reverb). Dispatch from tinker.

**Done when** you've written one line per case: symptom → which hop in §8 failed.

<details><summary>Hint for case 3</summary>

Look at the `jobs` table while the worker is stopped: `lerd artisan db:table jobs` or `lerd artisan tinker --execute 'DB::table("jobs")->count();'`. When the worker starts, what happens to that row?
</details>

<details><summary>Hint for case 4</summary>

Laravel signs its API request with the secret from `.env`. Reverb was started with the *old* secret. Read the tinker output and `storage/logs/laravel.log`.
</details>

---

## 05.7 🔴 Talk to Reverb without Echo

In the browser console on any page of the app, open a raw WebSocket and subscribe to `demo` using the Pusher protocol, with no Echo:

```js
const ws = new WebSocket(`wss://${location.host}/app/<REVERB_APP_KEY>?protocol=7&client=js&version=8.4.0`);
ws.onmessage = (m) => console.log(JSON.parse(m.data));
// after connection_established:
ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: 'demo' } }));
```

Dispatch from tinker and watch it arrive.

**Done when** you receive the event on the raw socket. Then answer: could you subscribe to `private-anything` this way? What stops you?

<details><summary>Hint</summary>

Private subscriptions need an `auth` signature in the subscribe frame, and that signature can only be made with the app **secret**. Module 07 shows who makes it.
</details>
