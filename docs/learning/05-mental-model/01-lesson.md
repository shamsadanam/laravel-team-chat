# 05 · The realtime mental model

**Goal:** understand every moving part between "PHP dispatches an event" and "Vue runs a callback", in *this* project's setup, and know how to debug each hop.

**You'll touch:** nothing new yet. You'll read config, watch traffic and fire events by hand.

---

## 1. The problem Reverb solves

HTTP works like this: the browser asks, the server answers, the connection closes. **The server can't speak first.** At the end of module 04, Ada sent a message and Linus saw nothing until he refreshed. HTTP can't fix that.

Options:

| Approach | How | Cost |
| --- | --- | --- |
| **Polling** | Browser asks "anything new?" every N seconds | Wasteful, and still delayed by up to N seconds |
| **Server-Sent Events** | One long-lived HTTP response, server → browser only | One direction only |
| **WebSockets** | One long-lived, two-way connection | Needs a server built for many open connections |

**Reverb is a WebSocket server**, written in PHP on top of an event loop (ReactPHP). It keeps thousands of connections open and pushes messages down them.

## 2. The five pieces

Think of a **radio station**:

| Radio | Laravel | In your project |
| --- | --- | --- |
| Something happens | **Event**, a PHP class implementing `ShouldBroadcast(Now)` | `app/Events/MessageSent.php` |
| Frequency | **Channel**: a name like `demo` or `rooms.1` | `new Channel('demo')` |
| Transmitter | **Reverb server**, a long-running process | lerd worker `reverb` |
| Radio receiver | **Laravel Echo**, the JS client | `configureEcho()` in `resources/js/app.ts` |
| Listener | **`useEcho…()` hooks** in Vue components | `useEchoPublic(...)` in `Welcome.vue` |

## 3. The full flow

```
 ┌──────────── PHP (FPM / queue worker) ────────────┐
 │ MessageSent::dispatch('hi')                       │
 │   → Laravel's broadcaster serializes the event    │
 │   → HTTP POST to Reverb's API  (/apps/{id}/events)│
 └───────────────────────┬───────────────────────────┘
                         ▼
               ┌──── Reverb server ────┐
               │ "who is subscribed to │
               │  channel `demo`?"     │
               └───────────┬───────────┘
                           │ pushes a frame over each open WebSocket (/app/{key})
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      Browser A        Browser B        Browser C   (Echo → your callback)
```

The two things beginners miss most:

1. **Reverb never runs your app code.** It doesn't know about models, policies or Vue. Laravel hands it *a channel name, an event name and a JSON payload*, and Reverb delivers them. (One exception: authorizing private channels, in module 07. Even then, Reverb asks *Laravel* over HTTP.)
2. **Laravel → Reverb is plain HTTP.** Your PHP code never holds a WebSocket. Only browsers do.

Reverb speaks the **Pusher protocol**. That's why `pusher-js` is in your `package.json`: Echo uses it under the hood as the transport.

## 4. Your project's wiring (lerd)

Your setup has one layer more than the Laravel docs describe. Here is what lerd does:

```
Browser ──wss://laravel-reverb-example.test/app/{key}──▶ nginx (lerd, port 443, TLS)
                                                         │  location /app  and /apps
                                                         ▼
                                       lerd-php85-fpm container : 8082
                                       (php artisan reverb:start --port=8082)
                                                         ▲
PHP in the same container ──http://localhost:8082/apps/…─┘
```

That explains your `.env`, which has **three groups** of Reverb variables, each with a different audience:

| Variables | Who reads them | Your value | Meaning |
| --- | --- | --- | --- |
| `REVERB_SERVER_PORT` (and `REVERB_SERVER_HOST`) | The Reverb **process** | `8082` | Where Reverb *listens* |
| `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME` | **Laravel**, when it sends events | `localhost:8082`, `http` | Where Laravel *sends* events. Server-to-server, so plain HTTP inside the container is fine |
| `VITE_REVERB_HOST/PORT/SCHEME` | The **browser** (baked into JS at build time) | `laravel-reverb-example.test:443`, `https` | Where browsers *connect*: through nginx, with TLS |

`REVERB_APP_KEY` is public: the browser sends it to identify the app. `REVERB_APP_SECRET` must stay secret, because Laravel uses it to sign API calls and private-channel auth.

Only `VITE_`-prefixed variables reach JavaScript, and **only when Vite builds or serves the bundle.** Change one and you must restart Vite (the lerd `vite` worker) or rebuild.

Open the nginx side yourself: `~/.local/share/lerd/nginx/conf.d/laravel-reverb-example.test.conf` has the `/app` and `/apps` `proxy_pass` blocks. Module 13 builds the same thing for production.

## 5. The browser side

`resources/js/app.ts`:

```ts
configureEcho({ broadcaster: 'reverb' });
```

This creates **one** Echo instance, so one WebSocket for the whole app. It reads `VITE_REVERB_*` automatically. Every `useEcho…` call shares that one socket and only adds channel subscriptions to it.

The hooks you'll use, from `@laravel/echo-vue`:

| Hook | Channel type | Module |
| --- | --- | --- |
| `useEchoPublic(name, event, cb)` | public | 06 |
| `useEcho(name, event, cb)` | **private** | 07 |
| `useEchoPresence(name, event, cb)` | presence | 08 |
| `useEchoModel(model, id, events, cb)` | model broadcasts (private) | 09 |
| `useEchoNotification(channel, cb)` | notifications (private) | 09 |
| `useConnectionStatus()` | connection state, reactive | 05, 10 |
| `useSocketId()` | this tab's socket id | 06 |
| `echo()` | the raw Echo instance | everywhere |

All `useEcho*` hooks must be called **directly in `<script setup>`**, not inside `onMounted` or a callback. They register cleanup with the component, so leaving the page unsubscribes.

## 6. Event names, payloads and the leading dot

```php
class MessageSent implements ShouldBroadcastNow
{
    public function __construct(public string $text) {}

    public function broadcastOn(): array
    {
        return [new Channel('demo')];
    }
}
```

- **Payload:** every **public property** is serialized: `{ "text": "hi" }`. Module 06 takes control with `broadcastWith()`.
- **Event name:** the class's full name: `App\Events\MessageSent`. Echo assumes the `App\Events` namespace, so you listen for `MessageSent`.
- If you give the event a custom name with `broadcastAs()` (`'message.sent'`), listen with a **leading dot**: `.message.sent`. The dot means "don't add the namespace".

## 7. `ShouldBroadcast` vs `ShouldBroadcastNow`

| | `ShouldBroadcast` | `ShouldBroadcastNow` |
| --- | --- | --- |
| When it's sent | A **queue job** sends it later | Sent **during the request** |
| Needs a queue worker | Yes (lerd `queue` worker; your `QUEUE_CONNECTION=database`) | No |
| Request speed | Fast; HTTP to Reverb happens elsewhere | The request waits for Reverb to answer |
| If Reverb is down | The job fails and can retry | The user's request errors |

Your demo uses `Now` so it works without thinking about queues. Module 11 explains when to switch and why production apps usually do.

## 8. Debugging: check each hop in order

When "nothing happens", walk the flow from §3 **in order**. Don't guess.

| # | Hop | How to check |
| --- | --- | --- |
| 1 | Is the browser connected? | DevTools → Network → **WS** filter → a `/app/…` connection with status **101**. Click it → **Messages** tab. You should see `pusher:connection_established`. |
| 2 | Did it subscribe? | In Messages: an outgoing `pusher:subscribe` with your channel, then an incoming `pusher_internal:subscription_succeeded`. |
| 3 | Did Laravel send the event? | Check `storage/logs/laravel.log` for errors. With `ShouldBroadcast`, check the job ran: `lerd artisan queue:failed`. |
| 4 | Did Reverb receive and push it? | Run Reverb in debug mode (below) and watch it log the message. |
| 5 | Did the callback match? | Incoming frame in the WS Messages tab has `"event": "App\\Events\\MessageSent"`. Does your listener name match, dot rules included? |

**Reverb in debug mode.** lerd runs Reverb as a background worker. To watch its traffic:

```bash
lerd worker stop reverb
lerd php artisan reverb:start --port=8082 --debug     # runs inside the PHP container
# …Ctrl+C when done, then:
lerd worker start reverb
```

Or just read the worker's log: `journalctl --user -u lerd-reverb-laravel-reverb-example -f`.

**Connection state in the UI.** `useConnectionStatus()` returns a reactive status (`connected`, `connecting`, `reconnecting`, `disconnected`, `failed`). Put it in a corner of your layout during development.

## 9. Common mistakes

| Symptom | Cause |
| --- | --- |
| No WS connection at all | `VITE_REVERB_*` wrong, or Vite not restarted after changing them. A host with `https://` in it (it should be a bare host). |
| WS fails with a mixed-content or TLS error | Page is `https` but `VITE_REVERB_SCHEME=http`. An https page can't open `ws://`. |
| Connected, never receives | Listening to the wrong channel, or the event name is missing/extra the leading dot. |
| Payload field is `undefined` | It isn't a **public** property (or isn't in `broadcastWith()`). |
| Worked, then stopped after editing `config/reverb.php` | Reverb is long-running. Restart the worker. |
| Event fires in tinker but not from the app | `ShouldBroadcast` without a running queue worker. |
| Listener never unsubscribes / fires twice | `useEcho…` called inside `onMounted` or a function instead of top-level `<script setup>`. |

## What you should be able to explain now

- Why HTTP alone can't push, and what a WebSocket changes.
- The full path of an event, naming the protocol used on each hop.
- Which of the three Reverb variable groups each process reads, and why the browser's host and port differ from Laravel's.
- Why Reverb never runs your app code.
- The five-hop debugging checklist.

Next: [exercises](02-exercises.md).
