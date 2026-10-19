# 08 · Presence channels and whispers

**Goal:** show who's in the room right now, and show "Linus is typing…". You'll use presence channels and client events (whispers), and learn what they can't be trusted with.

**You'll touch:** `RoomChannel`, your events, `rooms/Show.vue`, a couple of new components.

---

## 1. What presence adds

A presence channel is a private channel that also tracks **who is subscribed**:

| | Private | Presence |
| --- | --- | --- |
| Name prefix | `private-` | `presence-` |
| Needs `/broadcasting/auth` | yes | yes |
| Callback returns | `true`/`false` | **an array of user info**, or `false`/`null` |
| Extra events | — | `here`, `joining`, `leaving` |
| Echo hook | `useEcho` | `useEchoPresence` |

Reverb keeps the member list and sends it to each new subscriber (`here`), then pushes `joining` and `leaving` as people come and go. Laravel isn't involved after the auth request.

## 2. Authorizing presence

```php
class RoomChannel
{
    /**
     * @return array{id: int, name: string}|false
     */
    public function join(User $user, Room $room): array|false
    {
        return $user->can('view', $room) ? ['id' => $user->id, 'name' => $user->name] : false;
    }
}
```

- The array becomes the user's **`user_info`**, visible to *every other member*. Send only what you'd show: id and name, maybe an avatar URL. Never an email.
- The same `rooms.{room}` pattern serves `private-rooms.3` and `presence-rooms.3`. Returning an array is truthy, so private subscriptions still work.
- Members are identified by the user's id. Two tabs from the same user count as **one member**: Reverb sends `joining` only for the first connection and `leaving` only after the last one closes.

## 3. One channel per room

You could run a private channel for messages *and* a presence channel for "who's here". Simpler: **move everything to the presence channel.** Presence channels receive normal events too.

```php
public function broadcastOn(): array
{
    return [new PresenceChannel('rooms.'.$this->message->room_id)];
}
```

```ts
import { useEchoPresence } from '@laravel/echo-vue';

const { channel } = useEchoPresence<{ message: Message }>(
    `rooms.${props.room.id}`,
    '.message.posted',
    ({ message }) => { … },
);

type Member = { id: number; name: string };
const here = ref<Member[]>([]);

channel()
    .here((members: Member[]) => (here.value = members))
    .joining((member: Member) => here.value.push(member))
    .leaving((member: Member) => (here.value = here.value.filter((m) => m.id !== member.id)));
```

`channel()` returns the Echo presence channel object. Register `here`, `joining` and `leaving` once, in `<script setup>`.

## 4. Whispers: client → client events

"Linus is typing…" fires on every keystroke. Sending that through Laravel (HTTP → controller → broadcast) would be absurdly expensive. **Client events** skip Laravel: the browser sends a frame to Reverb, and Reverb relays it to the other members.

```ts
channel().whisper('typing', { id: me.id, name: me.name });

channel().listenForWhisper('typing', (e: { id: number; name: string }) => { … });
```

On the wire it's an event named `client-typing`. Echo adds and strips the `client-` prefix for you.

**Rules and limits:**

- Echo offers `whisper` only on **private and presence** channels.
- `config/reverb.php` → `accept_client_events_from` (yours: `members`). Reverb relays a whisper only from sockets subscribed to that channel. `all` drops that check. Anything else disables whispers.
- The sender doesn't receive its own whisper.
- **Whispers are untrusted.** Laravel never sees them. No validation, no persistence, no policy. A user can whisper any payload with any `name`. Use whispers only for **ephemeral, cosmetic** signals: typing, cursor position, "is viewing". Never for messages, votes or anything that changes state.
- **Throttle them.** One whisper per keystroke times 50 users is a lot of traffic. Send at most every 2–3 seconds, and expire the "typing" indicator on the receiving side after ~4 seconds of silence.

> Note that `user_info` in the presence member list is the one trustworthy identity on the channel: Laravel signed it. If you need to know who *really* whispered, compare the claimed id with the member list. Even then, treat it as cosmetic.

## 5. App-wide presence: "who's online"

A presence channel isn't tied to a room. One global channel gives you an online list:

```php
Broadcast::channel('online', fn (User $user) => ['id' => $user->id, 'name' => $user->name]);
```

Join it in the **persistent layout**, so it stays connected while the user moves between pages.

## 6. Presence is a *view*, not a *record*

- **It's lossy.** A closed laptop lid can take up to `activity_timeout` + ping (~30–60s in your config) before `leaving` fires.
- **It isn't stored.** Nothing hits the database. "Last seen at" needs your own column, updated on requests or on leave.
- **It's per-server.** With multiple Reverb servers (module 13), Reverb's Redis scaling keeps membership consistent across them.

## 7. Common mistakes

| Symptom | Cause |
| --- | --- |
| Presence auth fails while private worked | Callback returns `true` instead of an array. |
| `here` lists everyone except me | Correct. `here` is "who's here *besides* you". Add yourself from `auth.user`. |
| Same person listed twice | Deduplicate by `id` on `joining`: they joined from a second tab before Reverb collapsed them, or your `here` + `joining` overlap. |
| Whisper never arrives | Public channel, `accept_client_events_from` disallows it, or you listen for `client-typing` (Echo adds the prefix). |
| Typing indicator stuck forever | No timeout on the receiver. The sender may close the tab mid-typing. |
| Email visible in the WS tab | Your presence callback returned the full user. |

## What you should be able to explain now

- How presence differs from private, on the server and in the client.
- Why `user_info` must be minimal.
- How whispers travel, and why Laravel never sees them.
- What you must never use whispers for.
- Why presence is a lossy view, not a source of truth.

Next: [exercises](exercises.md).
