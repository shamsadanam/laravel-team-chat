# 11 · Solutions

---

## 11.1 Queue the events

```php
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

class MessagePosted implements ShouldBroadcast
```

Nothing else changes. `broadcast(...)->toOthers()` still captures the socket id at dispatch. The worker log shows lines like:

```
Illuminate\Broadcasting\BroadcastEvent ........ RUNNING
Illuminate\Broadcasting\BroadcastEvent ........ 12.34ms DONE
```

---

## 11.2 Outage

1. POSTs succeed instantly: the request only writes a job row.
2. The worker tries each job; the HTTP call to Reverb fails (connection refused); the job is retried until `--tries=3` runs out, then moves to `failed_jobs`.
3. `queue:failed` lists them with the exception.
4. After Reverb returns, `queue:retry all` re-queues them and Linus receives them, late but complete. (A client that was connected during the outage also re-syncs on reconnect from 10.4, so it may already have them.)

With backoff:

```php
use Illuminate\Queue\Attributes\Backoff;

#[Backoff([2, 10, 30])]
class MessagePosted implements ShouldBroadcast
```

The attempts now span ~40s, which often outlasts a short Reverb restart without anyone running `queue:retry`.

---

## 11.3 After-commit

```php
class RoomCreated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Room $room, public int $ownerId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->ownerId)];
    }

    public function broadcastAs(): string
    {
        return 'room.created';
    }

    public function broadcastWith(): array
    {
        return ['room' => $this->room->only('id', 'name', 'slug')];
    }
}
```

```php
$room = DB::transaction(function () use ($request) {
    $room = Room::create([...$request->validated(), 'owner_id' => $request->user()->id]);
    $room->members()->attach($request->user());

    broadcast(new RoomCreated($room, $request->user()->id));

    return $room;
});
```

**Rollback:** with `ShouldDispatchAfterCommit`, the dispatch is held until commit; on rollback it's discarded, so there's no job and no broadcast. Without it, on the `database` queue the job row is written inside the same transaction and is rolled back too. That's why the bug hides locally. On Redis (not transactional with your database) the job would survive the rollback and broadcast a room that doesn't exist.

---

## 11.4 Disorder

```ts
const unknownUpdates = new Map<number, Message>();

function upsertInOrder(message: Message): void {
    router.replaceProp('messages', (current: Message[]) => {
        const without = current.filter((m) => m.id !== message.id);

        return [...without, message].sort((a, b) => a.id - b.id);
    });
}

// posted
({ message }) => {
    upsertInOrder(unknownUpdates.get(message.id) ?? message);
    unknownUpdates.delete(message.id);
};

// updated
({ message }) => {
    const known = (page.props.messages as Message[]).some((m) => m.id === message.id);

    if (known) {
        upsertInOrder(message);
    } else {
        unknownUpdates.set(message.id, message);
    }
};
```

An update that arrives first is parked, and applied when (or instead of) the post. A simpler alternative: on an unknown id, call a debounced `router.reload({ only: ['messages'] })`, and the server sorts it out.

---

## 11.5 Broadcasts-first queue

Step 2: the jobs land on queue `broadcasts`, and the lerd worker runs `--queue=default`, so nobody picks them up. They sit in `jobs` with `queue = 'broadcasts'`.

After adding `queue-priority` (`--queue=broadcasts,default`), the worker checks `broadcasts` **first** every time it looks for a job. A chat message waits at most for the job *currently running* (up to 10s with your slow job). To avoid even that, run two workers: one for `broadcasts` only and one for `default`.

---

## 11.6 Fan-out job

```php
class NotifyRoomMembers implements ShouldQueue
{
    use Queueable;

    /**
     * @param  'renamed'|'activity'  $action
     */
    public function __construct(public int $roomId, public string $action) {}

    public function handle(): void
    {
        $room = Room::find($this->roomId);

        if ($room === null) {
            return;
        }

        $room->members()->pluck('users.id')->each(
            fn (int $userId) => broadcast(new RoomMembershipChanged($userId, $room->id, $this->action)),
        );
    }
}
```

```php
NotifyRoomMembers::dispatch($room->id, 'renamed')->afterCommit();
```

Each `broadcast()` inside the job is itself queued (`ShouldBroadcast`), so the fan-out job finishes quickly and the individual broadcasts flow through the worker. For very large rooms, consider `->chunk()` and whether one shared-channel event plus client-side reloads would be enough.

---

## 11.7 Server-side typing

```php
class UserTyping implements ShouldBroadcastNow, ShouldRescue
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $roomId, public int $userId, public string $name) {}

    public function broadcastOn(): array
    {
        return [new PresenceChannel('rooms.'.$this->roomId)];
    }

    public function broadcastAs(): string
    {
        return 'user.typing';
    }
}
```

```php
Route::post('/rooms/{room:slug}/typing', function (Request $request, Room $room) {
    Gate::authorize('sendMessage', $room);

    broadcast(new UserTyping($room->id, $request->user()->id, $request->user()->name))->toOthers();

    return response()->noContent();
})->middleware('throttle:typing')->name('rooms.typing');
```

```php
// AppServiceProvider::boot()
RateLimiter::for('typing', fn (Request $request) => Limit::perSecond(1, 3)->by($request->user()->id));
```

**Compared with whispers:** the server version has a *trusted* identity (the server sets `userId`/`name`), and rate limits and authorization apply. But it costs an HTTP request and a PHP process per signal, versus a free frame for a whisper. For a typing indicator, whispers usually win. The server route is for when identity or auditing matters.
