# 09 · Model broadcasting and broadcast notifications

**Goal:** two shortcuts Laravel gives you on top of plain events. You'll learn what each costs, and when an explicit event class is still the better choice.

- **Model broadcasting:** a model announces its own `created`/`updated`/`deleted`. You'll use it to sync room names everywhere.
- **Broadcast notifications:** one `$user->notify()` call stores a notification *and* pushes it live. You'll build @mentions.

**You'll touch:** `Room` model, `routes/channels.php`, `app/Notifications/`, `AppLayout`, a notifications menu.

> **Both shortcuts are queued.** `BroadcastableModelEventOccurred` and `BroadcastNotificationCreated` implement `ShouldBroadcast`, not `…Now`. Make sure the lerd `queue` worker is running (`lerd worker list`), and restart it after changing PHP code: `lerd artisan queue:restart`. Module 11 explains why.

---

## 1. Model broadcasting

```php
use Illuminate\Database\Eloquent\BroadcastsEvents;

class Room extends Model
{
    use BroadcastsEvents, HasFactory;

    /**
     * @return array<int, Channel|Model>
     */
    public function broadcastOn(string $event): array
    {
        return match ($event) {
            'updated', 'deleted' => [$this],
            default => [],
        };
    }
}
```

What happens:

- After every save or delete of a `Room`, Laravel builds an event named **`Room` + `Updated`** (`RoomUpdated`, `RoomDeleted`, …).
- Returning **the model itself** as a channel means `new PrivateChannel('App.Models.Room.3')`: model class with dots, then the key.
- `$event` is `created`, `updated`, `deleted`, `trashed` or `restored`. Return `[]` to skip broadcasting for that event. Here `created` is skipped: nobody is subscribed to a room that didn't exist a moment ago.

### Authorize the model channel

It's private, so it needs a rule. The name follows the convention:

```php
Broadcast::channel('App.Models.Room.{room}', RoomChannel::class);
```

The same `RoomChannel` works: members only.

### Shape the payload

By default the payload is `{ model: $room->toArray(), … }`: every visible attribute. Take control the same way as in module 06:

```php
/**
 * @return array{model: array<string, mixed>}
 */
public function broadcastWith(string $event): array
{
    return ['model' => $this->only('id', 'name', 'slug', 'description')];
}
```

Keep the `model` key so the client's `useEchoModel` typing (`e.model`) still fits.

### Listening

```ts
import { useEchoModel } from '@laravel/echo-vue';

useEchoModel<RoomPayload, 'App.Models.Room'>('App.Models.Room', props.room.id, ['.RoomUpdated'], (e) => {
    room.value = { ...room.value, ...e.model };
});
```

Model events use the **leading dot** (no `App\Events` namespace).

### Model broadcasting vs explicit events

| Use model broadcasting when… | Use an explicit event when… |
| --- | --- |
| You're syncing *the record itself* to people viewing it | The event is a *domain action* ("message posted", "member removed") |
| The audience is "whoever subscribes to this model's channel" | You choose the audience (a room, the owner, one user) |
| Every save should notify | Only some saves matter (`broadcastWhen`, or no event at all) |

Watch out: model broadcasting fires on **every** save, including seeders, console commands and background jobs. That's often what you want for "keep this record in sync", and rarely what you want for anything else. Messages stay explicit events.

## 2. Broadcast notifications

A notification is a message *to a specific user* that can go out through several **channels**: mail, database, broadcast, Slack… The `broadcast` channel pushes it over Reverb to `private-App.Models.User.{id}`, the per-user channel you already authorize in `routes/channels.php`.

```bash
lerd artisan make:notifications-table --no-interaction
lerd artisan migrate
lerd artisan make:notification MentionedInMessage --no-interaction
```

```php
class MentionedInMessage extends Notification
{
    public function __construct(public Message $message) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'message_id' => $this->message->id,
            'room' => $this->message->room->only('id', 'name', 'slug'),
            'by' => $this->message->user->only('id', 'name'),
            'excerpt' => Str::limit($this->message->body, 80),
        ];
    }
}
```

- `database` stores `toArray()` in the `notifications` table. That's the history, and the source for "unread".
- `broadcast` pushes the same data (plus `id` and `type`) live. Define `toBroadcast()` if the live payload should differ.
- `$user->notify(new MentionedInMessage($message))` does both.

### Listening

```ts
import { useEchoNotification } from '@laravel/echo-vue';

useEchoNotification<MentionPayload>(
    `App.Models.User.${user.id}`,
    (notification) => { unread.value++; … },
    'App.Notifications.MentionedInMessage',
);
```

The third argument filters by `type`, which defaults to the notification's class name.

### Unread counts: the database is the truth

```php
// HandleInertiaRequests::share()
'notifications' => fn () => $request->user()
    ? ['unread' => $request->user()->unreadNotifications()->count()]
    : null,
```

- On page load: the count comes from the database.
- Live: increment locally when a notification arrives.
- Marking as read: an HTTP request (`$user->unreadNotifications()->update(['read_at' => now()])`, or one `markAsRead()`), then reload the prop.

The live counter is **optimistic**. Any page load corrects it. That's the same pattern as module 06 (server state + live deltas), and module 10 builds on it.

## 3. Mentions: putting it together

```php
// MessageController@store, after creating the message
$mentioned = $room->members()
    ->whereIn('name', $this->mentionedNames($message->body))
    ->whereKeyNot($request->user()->id)
    ->get();

Notification::send($mentioned, new MentionedInMessage($message));
```

Only **members** of the room can be notified. A mention must never leak a private room's content to an outsider, and the excerpt is room content.

## 4. Common mistakes

| Symptom | Cause |
| --- | --- |
| Model/notification broadcasts never arrive | Queue worker not running, or running old code. `lerd artisan queue:restart`. |
| 403 on `private-App.Models.Room.3` | No `App.Models.Room.{room}` rule in `channels.php`. |
| `RoomUpdated` listener never fires | Missing the leading dot: `.RoomUpdated`. |
| Room payload contains more than you expected | No `broadcastWith($event)` on the model. |
| `notifications` table missing | `make:notifications-table` + `migrate`. |
| Lazy-loading exception in the queue log | `toArray()` touches `$message->room`/`user`. Load them before notifying, or `loadMissing` inside. |
| Counter drifts from reality | It's local and optimistic. Reload the prop after marking as read, and on reconnect (module 10). |

## What you should be able to explain now

- What `BroadcastsEvents` does, its naming conventions, and the channel it uses.
- When model broadcasting is the wrong tool.
- How one `notify()` call reaches both the database and a live socket.
- Why the unread count comes from the database, and live updates are only deltas.
- Why mentions are limited to room members.

Next: [exercises](02-exercises.md).
