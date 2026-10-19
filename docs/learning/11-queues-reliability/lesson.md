# 11 · Queues and reliability

**Goal:** move broadcasts off the request, and learn the failure modes that come with that: transactions, ordering, retries, missing models, slow fan-out.

**You'll touch:** your events, `MessageController`, `RoomController`, `config/queue.php` (read only), maybe `.lerd.yaml`.

---

## 1. Why queue broadcasts at all

With `ShouldBroadcastNow`, the user's request makes an HTTP call to Reverb **before** it can respond:

- **Latency:** every send waits for the Reverb round trip.
- **Coupling:** Reverb down means the user's POST errors, even though the message was saved.
- **Fan-out:** "notify 200 members" inside a request is a slow request.

With `ShouldBroadcast`, the event is serialized into a job (`Illuminate\Broadcasting\BroadcastEvent`), the request returns immediately, and a **queue worker** sends it. If Reverb is down, the job fails and **retries**.

## 2. The queue in this project

| Piece | Value |
| --- | --- |
| Driver | `QUEUE_CONNECTION=database`, jobs stored in the `jobs` table |
| Worker | lerd `queue` worker: `php artisan queue:work --queue=default --tries=3 --timeout=60` |
| Restart policy | systemd `Restart=always`, back after 5s if it exits |
| Failed jobs | `failed_jobs` table |
| In tests | `QUEUE_CONNECTION=sync` (phpunit.xml), so jobs run inline |

**Workers are long-running.** They load your code once. After changing an event, listener or anything they run:

```bash
lerd artisan queue:restart   # workers finish their current job and exit; systemd starts fresh ones
```

Forgetting this is the #1 "my change does nothing" cause in this module.

Useful commands:

```bash
lerd artisan queue:failed            # list failures
lerd artisan queue:retry all         # push them back
lerd artisan queue:flush             # delete all failed jobs
lerd artisan tinker --execute 'DB::table("jobs")->count();'   # what's waiting
```

## 3. What changes when an event is queued

```php
class MessagePosted implements ShouldBroadcast
```

- **Serialization:** `SerializesModels` stores only the model's class and id. The worker **re-fetches** the model when the job runs, so it sees the database *as of then*, not as of dispatch.
- **`toOthers()` still works:** the socket id is captured at dispatch and serialized with the event.
- **Missing models are dropped silently:** `BroadcastEvent` sets `deleteWhenMissingModels = true` by default. If the message is deleted before the job runs, the `message.posted` broadcast is discarded without an error. Usually that's what you want, but now you know why one never arrived.
- **Tries/backoff** come from the **event**: `#[Tries(5)]`, `#[Backoff([1, 5, 10])]`, or `$tries`/`$backoff` properties. Without them, the worker's `--tries=3` applies.

## 4. Transactions: the classic bug

```php
DB::transaction(function () use ($request, &$room) {
    $room = Room::create([...]);
    $room->members()->attach($request->user());
    broadcast(new RoomCreated($room));   // queued: a job row is written now…
});                                      // …but the room only becomes visible here
```

The worker can pick the job up **before the transaction commits**. With the `database` queue the job row itself is inside the transaction, which hides this locally. With Redis or SQS in production it bites: the worker re-fetches `Room #42`, which doesn't exist yet, so the job is deleted (missing model) or the payload is wrong.

Fixes:

```php
class RoomCreated implements ShouldBroadcast, ShouldDispatchAfterCommit
```

…which holds the event until the outermost transaction commits, and drops it if the transaction rolls back. Or set `'after_commit' => true` on the queue connection in `config/queue.php` (yours are all `false`) to apply it to every queued job, listener, notification and broadcast.

**Rule:** any queued event dispatched near a write should be after-commit. It's cheap insurance.

## 5. Ordering is not guaranteed

One worker processes jobs roughly first-in first-out. Two workers, retries or separate queues mean `message.updated` can arrive **before** `message.posted`. Make the client tolerant:

- An update or delete for an unknown id → ignore it, or schedule a reload.
- Insert by `sent_at`/`id` order, not "push to the end".
- Idempotent handlers (module 06's dedupe) make duplicates from retries harmless.

The server stays the truth (module 10), so a reload always fixes the order.

## 6. `ShouldRescue`: when "Now" must not break the request

Some events must go out immediately (no worker in the path), but losing one is acceptable:

```php
class UserTyping implements ShouldBroadcastNow, ShouldRescue
```

`ShouldRescue` wraps the broadcast in `rescue()`. If Reverb is unreachable, the exception is **reported** (logged) and the request **continues**.

## 7. Separate queues and priority

Broadcasts are latency-sensitive: a message that arrives 30 seconds late is useless. Don't let them wait behind slow jobs (emails, exports):

```php
use Illuminate\Queue\Attributes\Queue;

#[Queue('broadcasts')]
class MessagePosted implements ShouldBroadcast
```

…and run a worker that serves `broadcasts` first: `queue:work --queue=broadcasts,default`.

**In this project** the lerd worker only listens on `default`. Jobs on `broadcasts` would sit forever. Add a custom worker that replaces it:

```bash
lerd worker add queue-priority \
  --label "Queue (broadcasts first)" \
  --command "php artisan queue:work --queue=broadcasts,default --tries=3 --timeout=60" \
  --conflicts-with queue \
  --restart always
lerd worker start queue-priority
```

`--conflicts-with queue` stops the default worker when this one starts. The definition is saved to `.lerd.yaml`, so it's versioned with the project.

## 8. Fan-out belongs in a job

Broadcasting to 200 members' user channels (module 09.2, 10.5) from a controller is 200 HTTP calls to Reverb in the request. Move the loop into a queued job:

```php
class NotifyRoomMembers implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $roomId, public string $action) {}

    public function handle(): void
    {
        Room::find($this->roomId)?->members()->pluck('users.id')
            ->each(fn (int $id) => broadcast(new RoomMembershipChanged($id, $this->roomId, $this->action)));
    }
}
```

The request dispatches **one** job. Even better: ask whether each member needs a *personal* event, or whether one event on a shared channel (or reloading on focus) is enough.

## 9. Common mistakes

| Symptom | Cause |
| --- | --- |
| Changed the event, behavior didn't change | Worker runs old code. `lerd artisan queue:restart`. |
| Broadcasts arrive in bursts, late | Worker stopped, or broadcasts queued behind slow jobs. |
| Event silently never arrives | Model deleted before the job ran (`deleteWhenMissingModels`), or a queue name no worker listens to. |
| Works locally, fails in production with Redis | Dispatched inside a transaction without after-commit. |
| `message.updated` for a message the client doesn't have | Out-of-order delivery. Make handlers tolerant. |
| Request errors when Reverb is down | `ShouldBroadcastNow` without `ShouldRescue`. |

## What you should be able to explain now

- What a queued broadcast trades for what.
- Why workers need restarting, and how in this project.
- The transaction race and the two ways to prevent it.
- Why ordering isn't guaranteed, and how the client copes.
- When `ShouldRescue` is appropriate.
- Why fan-out goes in a job, and the worker change a custom queue needs here.

Next: [exercises](exercises.md).
