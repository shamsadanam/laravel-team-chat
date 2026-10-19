# 07 · Solutions

---

## 07.1 Go private

Each event:

```php
use Illuminate\Broadcasting\PrivateChannel;

public function broadcastOn(): array
{
    return [new PrivateChannel('rooms.'.$this->message->room_id)];
}
```

(`MessageDeleted`: `new PrivateChannel('rooms.'.$this->roomId)`.)

`routes/channels.php`:

```php
use App\Models\Room;
use App\Models\User;

Broadcast::channel('rooms.{room}', function (User $user, Room $room) {
    return $user->can('view', $room);
});
```

Vue: replace `useEchoPublic` with `useEcho` (same arguments).

---

## 07.2 The exploit fails

- Raw socket, no `auth`: `{"event":"pusher:subscription_error","channel":"private-rooms.3","data":{…}}`.
- `fetch` as Grace for `dev`: **403**, because `RoomPolicy::view` is false. For `general`: **200** with `{"auth":"<key>:<hex>"}`.

Note that Grace *can* get a signature for `general`, but it's tied to socket `1.1`. It's useless for any other connection.

---

## 07.3 Channel class

```php
<?php

namespace App\Broadcasting;

use App\Models\Room;
use App\Models\User;

class RoomChannel
{
    public function join(User $user, Room $room): bool
    {
        return $user->can('view', $room);
    }
}
```

```php
use App\Broadcasting\RoomChannel;

Broadcast::channel('rooms.{room}', RoomChannel::class);
```

---

## 07.4 Membership events

```php
class RoomMembershipChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    /**
     * @param  'joined'|'left'  $action
     */
    public function __construct(public int $userId, public int $roomId, public string $action) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'membership.changed';
    }

    /**
     * @return array{room_id: int, action: string}
     */
    public function broadcastWith(): array
    {
        return ['room_id' => $this->roomId, 'action' => $this->action];
    }
}
```

`RoomMembershipController@store`:

```php
$room->members()->syncWithoutDetaching([$request->user()->id]);

broadcast(new RoomMembershipChanged($request->user()->id, $room->id, 'joined'));
```

No `toOthers()` here: the user's **other tabs** have other sockets and should update, and the current tab redirects anyway.

`resources/js/components/UserChannelListener.vue`:

```vue
<script setup lang="ts">
import { router, usePage } from '@inertiajs/vue3';
import { useEcho } from '@laravel/echo-vue';

const page = usePage();

useEcho<{ room_id: number; action: 'joined' | 'left' }>(
    `App.Models.User.${page.props.auth.user!.id}`,
    '.membership.changed',
    () => router.reload({ only: ['rooms'] }),
);
</script>

<template>
    <span hidden />
</template>
```

`AppLayout.vue`: `<UserChannelListener v-if="page.props.auth.user" />`. The single root element is required for Vue components in this project.

---

## 07.5 Revocation

`RoomMembershipController@destroy`:

```php
$room->members()->detach($request->user()->id);

broadcast(new RoomMembershipChanged($request->user()->id, $room->id, 'left'));
```

(When an owner removes *someone else*, use that user's id.)

Listener:

```ts
import { router, usePage } from '@inertiajs/vue3';

const page = usePage();

useEcho<{ room_id: number; action: 'joined' | 'left' }>(
    `App.Models.User.${page.props.auth.user!.id}`,
    '.membership.changed',
    ({ room_id, action }) => {
        const viewing = page.component === 'rooms/Show' && (page.props.room as { id: number } | undefined)?.id === room_id;

        if (action === 'left' && viewing) {
            router.visit('/rooms');

            return;
        }

        router.reload({ only: ['rooms'] });
    },
);
```

For the toast, flash it from the server on the next request, or show a local one in the listener. Leaving `rooms/Show` unmounts it → `useEcho` sends `pusher:unsubscribe` for `private-rooms.3` → Ada's next post doesn't reach Grace's socket.

The remaining gap: a **malicious** client could ignore the event and stay subscribed. For chat that's accepted: they can't post (policy), they can't reload history (policy), and they lose the subscription on the next reconnect.

---

## 07.6 Owner-only channel

```php
Broadcast::channel('rooms.{room}.admin', function (User $user, Room $room) {
    return $room->owner_id === $user->id;
});
```

```php
class MemberJoined implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public Room $room, public User $member) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('rooms.'.$this->room->id.'.admin')];
    }

    public function broadcastAs(): string
    {
        return 'member.joined';
    }

    public function broadcastWith(): array
    {
        return ['member' => $this->member->only('id', 'name')];
    }
}
```

Ada subscribes with `useEcho(\`rooms.${room.id}.admin\`, '.member.joined', …)`, but only render that listener component when `room.owner_id === auth.user.id`, so non-owners don't trigger 403s.

---

## 07.7 Signature

In `PusherBroadcaster`, the auth string is built through the Pusher SDK's `authorizeChannel()` (Reverb's broadcaster reuses the Pusher one):

```php
$key = config('broadcasting.connections.reverb.key');
$secret = config('broadcasting.connections.reverb.secret');
$socketId = '1.1';
$channel = 'private-rooms.3';

$key.':'.hash_hmac('sha256', "{$socketId}:{$channel}", $secret);
```

It matches the `auth` from `/broadcasting/auth`.

**Why a browser can't:** making an HMAC needs the secret, and the secret never leaves the server. **If the secret leaked:** anyone could sign any private or presence subscription, *and* publish events through Reverb's API as if they were your app. Rotate it immediately. Your HTTP routes stay protected by sessions and policies, but every realtime guarantee is gone.
