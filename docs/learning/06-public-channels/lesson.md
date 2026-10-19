# 06 · Broadcasting chat messages (public channels)

**Goal:** when Ada posts, Linus's screen updates instantly. Along the way: shaping payloads, naming events, `toOthers()`, and merging live data with Inertia props.

> ⚠️ This module deliberately uses **public** channels, which anyone can subscribe to. You'll *exploit* that in exercise 06.6, then fix it properly in module 07. Don't ship public channels for private data.

**You'll touch:** `app/Events/`, `MessageController`, `resources/js/app.ts`, `rooms/Show.vue`.

---

## 1. The event

```bash
lerd artisan make:event MessagePosted --no-interaction
```

```php
class MessagePosted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel('rooms.'.$this->message->room_id)];
    }

    public function broadcastAs(): string
    {
        return 'message.posted';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'message' => MessageResource::make($this->message->loadMissing('user'))->resolve(),
        ];
    }
}
```

Every method here is a decision:

- **Channel per room** (`rooms.1`). Subscribers get only that room's traffic. A single `chat` channel would send every message to every client.
- **Use the room id, not the slug.** Slugs can be renamed; ids never change. A rename would otherwise strand subscribers on the old channel name.
- **`broadcastAs('message.posted')`** gives a stable, namespace-free name. Listen with `.message.posted`.
- **`broadcastWith()`** takes control of the payload. Without it, the public `$message` property would be serialized raw, including every column and every loaded relationship. With it, **the page and the socket use the same `MessageResource` shape** (module 02's promise).

## 2. Dispatching it

```php
// MessageController@store
$message = $room->messages()->create([...]);

broadcast(new MessagePosted($message))->toOthers();

return back();
```

- `MessagePosted::dispatch($message)` also broadcasts. The `broadcast()` helper is used because it gives you **`toOthers()`**.
- **Why `toOthers()`?** The sender already gets the message through the Post → Redirect → Get cycle (module 03). If the socket delivered it too, the sender would see it twice, or need deduplication.

## 3. `toOthers()` needs the socket id, and Inertia v3 doesn't send it for you

`toOthers()` works like this: the browser sends its socket id in an `X-Socket-ID` header, and Laravel tells Reverb "deliver to everyone except that socket".

**The trap:** Echo automatically adds that header only to **axios**, jQuery and Turbo requests. Inertia v3 removed axios and uses its own HTTP client. So out of the box, `toOthers()` silently does nothing, and senders receive their own messages.

Fix it once, in `resources/js/app.ts`, with Inertia's HTTP interceptor:

```ts
import { http } from '@inertiajs/vue3';
import { configureEcho, echo } from '@laravel/echo-vue';

configureEcho({ broadcaster: 'reverb' });

// Echo only auto-attaches X-Socket-ID to axios/jQuery/Turbo; Inertia v3 uses its own client.
http.onRequest((config) => {
    const socketId = echo().socketId();

    if (socketId) {
        config.headers = { ...config.headers, 'X-Socket-ID': socketId };
    }

    return config;
});
```

Verify: DevTools → Network → your POST → Request Headers → `X-Socket-ID: 123.456`.

> Even with `toOthers()`, **deduplicate by id on the client** anyway. Two tabs of the same user have different sockets, and reconnects or races happen. Code that assumes "every message arrives exactly once" breaks.

## 4. Listening and merging with Inertia props

Inertia props are the server's view of the page **at load time**. Live events arrive **after** that. Combine them:

```vue
<script setup lang="ts">
import { useEchoPublic } from '@laravel/echo-vue';
import { ref, watch } from 'vue';

const props = defineProps<{ room: Room; messages: Message[] }>();

const messages = ref<Message[]>([...props.messages]);

// After our own send, Inertia reloads props, so re-sync from the server's truth.
watch(() => props.messages, (fresh) => (messages.value = [...fresh]));

useEchoPublic<{ message: Message }>(`rooms.${props.room.id}`, '.message.posted', ({ message }) => {
    if (!messages.value.some((m) => m.id === message.id)) {
        messages.value.push(message);
    }
});
</script>
```

- `messages` is a **local copy**: props are read-only, and you're adding to the list.
- The `watch` keeps the copy honest when the server sends fresh props (your own send, or a reload).
- The dedupe check makes double delivery harmless.

**Navigation between rooms:** clicking from `general` to `dev` re-mounts the page component (Inertia's default for link visits), so the old subscription is cleaned up and a new one starts with the new channel name. If you ever keep component state across visits (`preserveState`), pass the dependencies argument to the hook so it resubscribes when `room.id` changes.

## 5. Per-viewer data doesn't belong in broadcasts

In 04.5 you added `can: { update, delete }` to `MessageResource`, computed with `$request->user()`. During a broadcast, "the request user" is the **sender**. The payload is the same JSON for every receiver, but permissions differ per receiver. Linus would get Ada's permissions.

**Rule:** a broadcast payload must be the same for everyone on the channel. Per-viewer facts (permissions, "is this mine?", unread state) are computed **by each client** from data it already has (`auth.user.id`, `room.owner_id`), or fetched by each client.

The server still **enforces** permissions with policies. The client-side check only decides which buttons to show.

## 6. Edits and deletes

```php
broadcast(new MessageUpdated($message))->toOthers();
broadcast(new MessageDeleted($room->id, $message->id))->toOthers();
```

`MessageDeleted` takes **plain ids**, not the model. After `delete()`, there's no row to reload, and once the event is queued (module 11) a model property would fail to restore. Broadcast only what's needed to update the UI.

## 7. Anonymous events: when a class is overkill

```php
Broadcast::on('rooms.'.$room->id)->as('room.cleared')->with(['by' => $user->name])->sendNow();
```

Fine for throwaway signals. Use a real event class when you want tests, queues, `toOthers()` from the request or reuse.

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| Sender sees their message twice | `toOthers()` without the `X-Socket-ID` interceptor, and no client dedupe. |
| Receivers see Edit/Delete buttons on others' messages | Per-viewer `can` flags in the broadcast payload (§5). |
| Works in `general`, stops after navigating to `dev` | Channel name computed once and the component wasn't remounted (`preserveState`). |
| Payload has `email`, `password`… | No `broadcastWith()`; the raw model was serialized. |
| `messages.push` does nothing visible | You pushed into `props.messages` (read-only), not your local `ref`. |
| New message appears at the top | Your list is newest-first, or you used `unshift`. Match the server's order. |

## What you should be able to explain now

- Why one channel per room, named by id.
- What `broadcastWith()` protects against and why it reuses `MessageResource`.
- How `toOthers()` works, and why it needs an interceptor with Inertia v3.
- How live events and Inertia props stay consistent.
- Why per-viewer data must never be in a broadcast payload.

Next: [exercises](exercises.md).
