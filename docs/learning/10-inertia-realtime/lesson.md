# 10 · Inertia + realtime patterns

**Goal:** make the chat feel instant *and* stay correct. You'll choose between "push data" and "push a signal", use Inertia's prop helpers, send optimistically, and recover from missed events.

**You'll touch:** `rooms/Show.vue`, `AppLayout`, `RoomController`.

---

## 1. Two ways to react to an event

| | **Push data** | **Push a signal, then fetch** |
| --- | --- | --- |
| The event carries | The new state (`{ message: {...} }`) | Just "something changed" (`{ room_id }`) |
| Client does | Applies it directly | `router.reload({ only: ['messages'] })` |
| Speed | Instant, no extra request | One HTTP round trip |
| Payload | Must be viewer-independent (module 06 §5) | Server renders per viewer, so permissions are fine |
| Correctness risk | Client and server state can drift | Always the server's truth |
| Cost at scale | Cheap | N clients × 1 request for every event |

**Rules of thumb:**
- High-frequency, small, viewer-independent → **push data** (chat messages, typing, counters).
- Rare, complex or per-viewer → **signal + partial reload** (sidebar after membership changes, permission-sensitive views, aggregates).
- Most real apps use both. You already do: messages push data, `membership.changed` pushes a signal.

## 2. Partial reloads

```ts
router.reload({ only: ['rooms'] });
```

- Sends `X-Inertia-Partial-Data: rooms`. The server resolves **only** that prop. That's why props should be closures (`'rooms' => fn () => …`): a non-closure value is computed even when it isn't sent.
- `router.reload()` preserves component state and scroll by default. A half-typed message survives.
- **Coalesce bursts.** If 20 events arrive in a second, don't send 20 reloads:

```ts
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

function reloadRoomsSoon(): void {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => router.reload({ only: ['rooms'] }), 300);
}
```

## 3. Prop helpers: one source of truth

In module 06 you kept a local `messages` ref and synced it from props with a `watch`. It works, but you now have **two** copies of the truth, and a watch that can overwrite live additions.

Inertia v3 can change page props on the client directly:

```ts
router.appendToProp('messages', message);
router.replaceProp('messages', (current: Message[]) => current.map((m) => (m.id === message.id ? message : m)));
router.prependToProp('notifications', notification);
```

These are client-side visits: no request, and scroll and state are preserved. Now the template reads `props.messages` directly, with no copy and no watch:

```ts
useEchoPresence<{ message: Message }>(channelName, '.message.posted', ({ message }) => {
    router.replaceProp('messages', (current: Message[]) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
    );
});
```

Why `replaceProp` and not `appendToProp`? `appendToProp` **always** appends exactly one value; whatever its callback returns becomes the new item (see `appendToProp` in `node_modules/@inertiajs/core/dist/index.js`). It can't express "append unless it's a duplicate". `replaceProp` with a callback can.

## 4. Optimistic sending

Waiting for the round trip before showing your own message feels slow. Show it **immediately**, then let the server confirm or roll back:

```ts
form
    .optimistic((props) => ({
        messages: [...props.messages, pendingMessage(form.body)],
    }))
    .post(store.url(props.room.slug), {
        preserveScroll: true,
        onSuccess: () => form.reset('body'),
    });
```

- Inertia snapshots `messages`, applies your version, sends the request, and then either takes the server's fresh props (success) or **restores the snapshot** (failure). The rollback is automatic.
- The pending message needs a **temporary id** that can't collide with real ones (e.g. a negative number or `crypto.randomUUID()`), and a `pending: true` flag so you can style it (greyed out, "sending…").
- On success, the redirect brings the real message from the server, so the pending one is simply replaced. No matching needed for *your own* message, thanks to `toOthers()`.

**Where it gets subtle:** while your request is in flight, a live message from Linus may arrive. Inertia tracks which props an optimistic update touched and won't let the server response clobber a prop until the last optimistic request on it resolves. On *rollback*, though, a live message appended during the request may disappear until the next reload. For chat that's acceptable (rollbacks are rare, and the next reload restores it), but know the limit.

## 5. Missed events: the gap problem

WebSockets don't replay. Anything broadcast while a client was disconnected is **gone** for that client:

- Laptop sleep, Wi-Fi switch, Reverb restart during a deploy.
- Background tabs: browsers throttle timers. The socket usually survives, but treat background periods as suspect.

**Fix: re-sync on reconnect.** Watch the connection status and reload the volatile props when it comes back:

```ts
import { useConnectionStatus } from '@laravel/echo-vue';

const status = useConnectionStatus();

watch(status, (now, before) => {
    if (now === 'connected' && before !== 'connected' && before !== undefined) {
        router.reload({ only: ['messages', 'rooms', 'notifications'] });
    }
});
```

Also consider reloading when the tab becomes visible after a long time hidden (`document.visibilityState`).

**Mental model:** the socket is an *accelerator*, not the source of truth. The server's props are the truth. Every live update is a *prediction* that the next reload confirms.

## 6. Where listeners live

| Listener | Put it in | Why |
| --- | --- | --- |
| Room messages, presence, typing | The room page | Scoped to that room; unsubscribes when you leave |
| User channel (membership, notifications) | Persistent layout (child component, only when logged in) | Needed on every page; persistent layout = one subscription for the session |
| Global `online` presence | Persistent layout | Same |
| Reconnect re-sync | Persistent layout | One watcher, reloads whichever props the current page has |

## 7. A fallback when sockets aren't possible

Corporate proxies sometimes block WebSockets. If `status` sits at `failed`, fall back to polling:

```ts
const { start, stop } = usePoll(5000, { only: ['messages'] }, { autoStart: false });

watch(status, (now) => (now === 'failed' ? start() : stop()), { immediate: true });
```

Slower and costlier, but it degrades gracefully instead of silently going stale.

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| A live message vanishes when you send yours | The 06-style `watch` replaced the local copy with fresh props that didn't include it yet. Use prop helpers, or merge by id. |
| Duplicate own message | Optimistic item + socket echo. Check `toOthers()` and `X-Socket-ID`. |
| After a laptop wakes, the room is missing messages | No re-sync on reconnect. |
| Reload storm when many events arrive | Not coalescing reloads. |
| Partial reload doesn't refresh the sidebar | The shared prop isn't a closure, or the name in `only` doesn't match the key. |
| Optimistic message stays forever on error | You built it outside `optimistic()` (no snapshot, no rollback). |

## What you should be able to explain now

- When to push data and when to push a signal.
- Why prop helpers beat a local copy plus `watch`.
- How optimistic updates roll back, and what they can't protect.
- Why reconnecting doesn't restore missed events, and how you re-sync.
- Where each kind of listener belongs.

Next: [exercises](exercises.md).
