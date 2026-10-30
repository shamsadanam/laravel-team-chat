# 06 · Solutions

---

## 06.1 Event

`app/Events/MessagePosted.php`:

```php
<?php

namespace App\Events;

use App\Http\Resources\MessageResource;
use App\Models\Message;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

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
     * @return array{message: array<string, mixed>}
     */
    public function broadcastWith(): array
    {
        return [
            'message' => MessageResource::make($this->message->loadMissing('user'))->resolve(),
        ];
    }
}
```

`MessageController@store`:

```php
$message = $room->messages()->create([
    'user_id' => $request->user()->id,
    'body' => $request->validated('body'),
]);

broadcast(new MessagePosted($message));

return back();
```

`loadMissing('user')` matters: `preventLazyLoading` would otherwise throw inside `MessageResource` when it reads `$this->user`.

---

## 06.2 Live messages

```vue
<script setup lang="ts">
import { useEchoPublic } from '@laravel/echo-vue';
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ room: Room; messages: Message[] }>();

const messages = ref<Message[]>([...props.messages]);
const list = ref<HTMLElement | null>(null);

watch(() => props.messages, (fresh) => (messages.value = [...fresh]));

async function scrollToBottomIfNear(): Promise<void> {
    const el = list.value;

    if (!el) {
        return;
    }

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    await nextTick();

    if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
}

useEchoPublic<{ message: Message }>(`rooms.${props.room.id}`, '.message.posted', ({ message }) => {
    if (messages.value.some((m) => m.id === message.id)) {
        return;
    }

    messages.value.push(message);
    void scrollToBottomIfNear();
});
</script>

<template>
    <div ref="list" class="h-[70vh] overflow-y-auto">
        <article v-for="message in messages" :key="message.id">…</article>
    </div>
</template>
```

`nearBottom` is measured **before** `nextTick`, while the DOM still has the old height.

---

## 06.3 `toOthers()`

```php
broadcast(new MessagePosted($message))->toOthers();
```

Plus the interceptor in `resources/js/app.ts` (lesson §3). On the server side, `InteractsWithSockets::dontBroadcastToCurrentUser()` reads `X-Socket-ID` through `Broadcast::socket($request)` and passes it to Reverb as the excluded socket.

---

## 06.4 Edits and deletes

```php
class MessageUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message) {}

    public function broadcastOn(): array
    {
        return [new Channel('rooms.'.$this->message->room_id)];
    }

    public function broadcastAs(): string
    {
        return 'message.updated';
    }

    public function broadcastWith(): array
    {
        return ['message' => MessageResource::make($this->message->loadMissing('user'))->resolve()];
    }
}
```

```php
class MessageDeleted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $roomId, public int $messageId) {}

    public function broadcastOn(): array
    {
        return [new Channel('rooms.'.$this->roomId)];
    }

    public function broadcastAs(): string
    {
        return 'message.deleted';
    }

    /**
     * @return array{id: int}
     */
    public function broadcastWith(): array
    {
        return ['id' => $this->messageId];
    }
}
```

Controller:

```php
// update
$message->update(['body' => $request->validated('body')]);
broadcast(new MessageUpdated($message))->toOthers();

// destroy
$message->delete();
broadcast(new MessageDeleted($room->id, $message->id))->toOthers();
```

Vue:

```ts
const channelName = `rooms.${props.room.id}`;

useEchoPublic<{ message: Message }>(channelName, '.message.updated', ({ message }) => {
    const index = messages.value.findIndex((m) => m.id === message.id);

    if (index !== -1) {
        messages.value[index] = message;
    }
});

useEchoPublic<{ id: number }>(channelName, '.message.deleted', ({ id }) => {
    messages.value = messages.value.filter((m) => m.id !== id);
});
```

The three hooks share one `rooms.N` subscription. Echo reuses the channel and only adds listeners.

---

## 06.5 Permissions per viewer

`MessageResource`: delete the `can` key. Add `owner_id` to the room prop: `$room->only('id', 'name', 'slug', 'description', 'owner_id')`.

`resources/js/lib/permissions.ts`:

```ts
import type { User } from '@/types/auth';

type MessageLike = { author: { id: number } };
type RoomLike = { owner_id: number };

// Display only: MessagePolicy enforces the real rule on the server.
export function canEditMessage(message: MessageLike, user: User | null): boolean {
    return user !== null && message.author.id === user.id;
}

export function canDeleteMessage(message: MessageLike, room: RoomLike, user: User | null): boolean {
    return user !== null && (message.author.id === user.id || room.owner_id === user.id);
}
```

```vue
<button v-if="canEditMessage(message, page.props.auth.user)">Edit</button>
<button v-if="canDeleteMessage(message, room, page.props.auth.user)">Delete</button>
```

---

## 06.6 The exploit

```js
const ws = new WebSocket(`wss://${location.host}/app/<key>?protocol=7&client=js&version=8.4.0`);
ws.onmessage = (m) => console.log(JSON.parse(m.data));
ws.onopen = () => setTimeout(() => ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: 'rooms.3' } })), 500);
```

Ada's message in `dev` appears in Grace's console.

**Why the policy didn't help:** `RoomPolicy` guards **HTTP routes**. A public channel never asks Laravel anything. Reverb delivers to anyone who knows the name. Channel authorization is a separate gate, and you haven't set it up yet.

---

## 06.7 Pin via anonymous event

```php
public function pin(Room $room, Message $message): RedirectResponse
{
    Gate::authorize('pin', $room);

    $room->update(['pinned_message_id' => $message->id]);

    Broadcast::on('rooms.'.$room->id)
        ->as('message.pinned')
        ->with(['message' => MessageResource::make($message->loadMissing('user'))->resolve()])
        ->toOthers()
        ->sendNow();

    return back();
}
```

```ts
useEchoPublic<{ message: Message | null }>(channelName, '.message.pinned', ({ message }) => {
    pinned.value = message;
});
```

**When to make it a class:** once you want to test it with `Event::fake()`, queue it with retries or after-commit, or dispatch it from more than one place. A class gives it a name you can search for and assert on.
