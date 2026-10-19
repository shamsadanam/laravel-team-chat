# 08 · Solutions

---

## 08.1 Presence auth

```php
class RoomChannel
{
    /**
     * @return array{id: int, name: string}|false
     */
    public function join(User $user, Room $room): array|false
    {
        if (! $user->can('view', $room)) {
            return false;
        }

        return ['id' => $user->id, 'name' => $user->name];
    }
}
```

Events: `new PresenceChannel('rooms.'.$this->message->room_id)` (and `$this->roomId` for deleted).

Auth response:

```json
{"auth":"key:…","channel_data":"{\"user_id\":2,\"user_info\":{\"id\":2,\"name\":\"Linus\"}}"}
```

---

## 08.2 Here now

```vue
<script setup lang="ts">
import { usePage } from '@inertiajs/vue3';
import { useEchoPresence } from '@laravel/echo-vue';
import { ref } from 'vue';

type Member = { id: number; name: string };

const props = defineProps<{ room: Room; messages: Message[] }>();
const page = usePage();
const here = ref<Member[]>([]);

const { channel } = useEchoPresence<{ message: Message }>(
    `rooms.${props.room.id}`,
    '.message.posted',
    ({ message }) => appendMessage(message),
);

channel()
    .here((members: Member[]) => {
        here.value = members.filter((m) => m.id !== page.props.auth.user?.id);
    })
    .joining((member: Member) => {
        if (!here.value.some((m) => m.id === member.id)) {
            here.value.push(member);
        }
    })
    .leaving((member: Member) => {
        here.value = here.value.filter((m) => m.id !== member.id);
    });
</script>

<template>
    <aside class="w-48 border-l p-3 text-sm">
        <h2 class="mb-2 font-semibold">Here now</h2>
        <p>🟢 You</p>
        <p v-for="member in here" :key="member.id">🟢 {{ member.name }}</p>
    </aside>
</template>
```

(The message updated/deleted listeners use `useEchoPresence` too, with the same channel name.)

---

## 08.3 Typing indicator

```ts
const me = page.props.auth.user!;
let lastWhisperAt = 0;

function onComposerInput(): void {
    if (Date.now() - lastWhisperAt < 2000) {
        return;
    }

    lastWhisperAt = Date.now();
    channel().whisper('typing', { id: me.id, name: me.name });
}

const typers = reactive(new Map<number, { name: string; timer: ReturnType<typeof setTimeout> }>());

function stopTyping(userId: number): void {
    clearTimeout(typers.get(userId)?.timer);
    typers.delete(userId);
}

channel().listenForWhisper('typing', (e: { id: number; name: string }) => {
    clearTimeout(typers.get(e.id)?.timer);
    typers.set(e.id, { name: e.name, timer: setTimeout(() => typers.delete(e.id), 4000) });
});

// in the .message.posted callback:
stopTyping(message.author.id);

const typingLabel = computed(() => {
    const names = [...typers.values()].map((t) => t.name);

    if (names.length === 0) {
        return '';
    }

    if (names.length === 1) {
        return `${names[0]} is typing…`;
    }

    if (names.length === 2) {
        return `${names[0]} and ${names[1]} are typing…`;
    }

    return 'Several people are typing…';
});
```

`<textarea @input="onComposerInput">`. The 4s expiry is longer than the 2s send interval, so the indicator doesn't flicker while someone types continuously.

---

## 08.4 Who's online

`routes/channels.php`:

```php
Broadcast::channel('online', fn (User $user) => ['id' => $user->id, 'name' => $user->name]);
```

`resources/js/lib/presence.ts`:

```ts
import { ref } from 'vue';

export const onlineUserIds = ref(new Set<number>());
```

`resources/js/components/OnlineListener.vue`:

```vue
<script setup lang="ts">
import { usePresenceChannel } from '@laravel/echo-vue';
import { onlineUserIds } from '@/lib/presence';

type Member = { id: number; name: string };

const { channel } = usePresenceChannel('online');

channel()
    .here((members: Member[]) => (onlineUserIds.value = new Set(members.map((m) => m.id))))
    .joining((m: Member) => (onlineUserIds.value = new Set(onlineUserIds.value).add(m.id)))
    .leaving((m: Member) => {
        const next = new Set(onlineUserIds.value);
        next.delete(m.id);
        onlineUserIds.value = next;
    });
</script>

<template>
    <span hidden />
</template>
```

Replacing the `Set` (instead of mutating it) keeps Vue reactivity simple. Rendered from `AppLayout` with `v-if="page.props.auth.user"`. The layout is persistent, so the subscription survives navigation.

---

## 08.5 Lying whispers

Reverb with `members` mode guarantees the sender is **subscribed** to the channel, so only a room member can whisper there. But the relayed frame contains only `event`, `channel` and `data` (see `ClientEvent.php`: "only include the expected fields"). The receiver doesn't learn *which* member sent it. So the `{ id, name }` inside `data` is just the sender's claim. Grace, a legitimate member, can impersonate anyone in the room's typing indicator.

That's acceptable for a typing indicator (cosmetic, short-lived). It's why whispers must never carry anything that matters. If identity matters, go through Laravel: an HTTP request, then a broadcast with server-built data.

---

## 08.6 Last seen

Migration: `$table->timestamp('last_seen_at')->nullable();` on `room_user`, and `->withPivot('last_seen_at')` on both `belongsToMany` relations.

On load (`RoomController@show`):

```php
$room->members()->updateExistingPivot($request->user()->id, ['last_seen_at' => now()]);
```

On leave: a small `POST /rooms/{room:slug}/seen` route, called from `onBeforeUnmount` (navigation within the app) and `navigator.sendBeacon` on `pagehide` (tab closed). `sendBeacon` can't add the CSRF header, so either exclude that route from CSRF checks (low-risk: it only updates your own timestamp) or rely on the next page load to update it.

**Why presence can't:** presence lives in Reverb's memory and disappears with the connection. Nothing is written anywhere. "Last seen" is a fact about the past, so it needs storage.
